/**
 * MouseTracker — nguồn sự kiện chuột "thụ động" (di chuột, KHÔNG click) dùng chung
 * cho toàn app. Các tính năng (popup hover, toạ độ chuột...) không tự tạo
 * ScreenSpaceEventHandler riêng mà subscribe vào đây.
 *
 * Nhiệm vụ:
 * 1. Lưu vị trí chuột mới nhất trên canvas.
 * 2. Gom mọi thay đổi trong 1 frame lại, phát cho subscriber TỐI ĐA 1 LẦN / frame
 *    (requestAnimationFrame) — tránh chạy scene.pick hàng chục lần giữa 2 frame.
 * 3. Phát cả khi CAMERA di chuyển mà chuột đứng yên — vì lúc đó thứ nằm dưới
 *    con trỏ đã thay đổi dù không có sự kiện MOUSE_MOVE nào.
 * 4. Phát `null` khi chuột rời canvas — để subscriber biết mà ẩn/reset.
 *
 * Chữ ký subscriber: (mousePosition: Cesium.Cartesian2 | null, viewer) => void
 * LƯU Ý: `mousePosition` là object dùng chung nội bộ — chỉ ĐỌC trong lúc được
 * gọi, không sửa, không giữ lại tham chiếu (cần giữ thì Cartesian2.clone).
 *
 * Dùng qua singleton ở cuối file: initMouseTracker(viewer) / getMouseTracker().
 */

import { logger } from '../../utils/logger';

class MouseTracker {
    constructor(viewer) {
        this._viewer = viewer;
        this._subscribers = new Set();
        this._mousePos = new Cesium.Cartesian2(); // vị trí chuột mới nhất
        this._mouseInside = false;
        this._frameRequested = false;
        this._lastViewMatrix = Cesium.Matrix4.clone(viewer.camera.viewMatrix);

        // bind / arrow function để giữ đúng `this` khi truyền làm callback
        // (requestAnimationFrame, addEventListener gọi hàm không kèm `this`)
        // khi trong đó dùng this thì this sẽ là biến this này
        this._dispatch = this._dispatch.bind(this);
        this._onMouseLeave = () => {
            this._mouseInside = false;
            this._requestDispatch();
        };

        this._handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        this._handler.setInputAction((movement) => {
            // Track vị trí của chuột tại mọi vị trí trên canvas và lưu lại
            Cesium.Cartesian2.clone(movement.endPosition, this._mousePos);
            this._mouseInside = true;
            this._requestDispatch();
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        viewer.scene.canvas.addEventListener('mouseleave', this._onMouseLeave);

        // Không dùng camera.changed: event đó chỉ bắn khi camera đổi quá
        // `percentageChanged` (mặc định 0.5 = 50%) - không đủ chính xác.
        // Thay vào đó so viewMatrix sau mỗi frame: camera đứng yên thì ma trận
        // giống hệt, phép so sánh 16 số gần như không tốn gì.
        this._removePostRender = viewer.scene.postRender.addEventListener(() => {
            this._checkCameraMoved();
        });
    }

    /**
     * Đăng ký nhận vị trí chuột. Trả về hàm huỷ đăng ký.
     * @param {(pos: Cesium.Cartesian2 | null, viewer: Cesium.Viewer) => void} fn
     */
    subscribe(fn) {
        this._subscribers.add(fn);
        return () => this._subscribers.delete(fn);
    }

    destroy() {
        this._handler?.destroy();
        this._handler = null;
        this._removePostRender?.();
        this._removePostRender = null;

        if (this._viewer && !this._viewer.isDestroyed()) {
            this._viewer.scene.canvas.removeEventListener('mouseleave', this._onMouseLeave);
        }

        this._subscribers.clear();
        this._viewer = null;
    }

    //=========================================== PRIVATE ===========================================
    _checkCameraMoved() {
        const viewMatrix = this._viewer.camera.viewMatrix;
        if (Cesium.Matrix4.equals(viewMatrix, this._lastViewMatrix)) return;

        Cesium.Matrix4.clone(viewMatrix, this._lastViewMatrix);

        if (this._mouseInside) this._requestDispatch();
    }

    _requestDispatch() {
        if (this._frameRequested) return;
        this._frameRequested = true;
        requestAnimationFrame(this._dispatch);
    }

    _dispatch() {
        this._frameRequested = false;
        if (!this._viewer || this._viewer.isDestroyed()) return;

        const pos = this._mouseInside ? this._mousePos : null;
        for (const fn of this._subscribers) {
            try {
                fn(pos, this._viewer);
            } catch (err) {
                logger.error('[MouseTracker] subscriber lỗi:', err);
            }
        }
    }
}

//====================== INIT SINGLETON =============================================
let _instance = null;

export function initMouseTracker(viewer) {
    if (_instance) return _instance;
    _instance = new MouseTracker(viewer);
    return _instance;
}

export function getMouseTracker() {
    if (!_instance) {
        logger.error('MouseTracker chưa được tạo — gọi initMouseTracker(viewer) trước');
        return;
    }
    return _instance;
}

export function destroyMouseTracker() {
    _instance?.destroy();
    _instance = null;
}
