/**
 * PopupLayer — quản lý popup HTML gắn theo entity.
 *
 * ── HỢP ĐỒNG PHÍA ENTITY (truyền trong options của viewer.entities.add) ──
 *   popup: {
 *     create(): HTMLElement            // BẮT BUỘC — gọi 1 lần, lần đầu popup cần hiện
 *     update?(el, entity): void        // tuỳ chọn — gọi định kỳ khi popup đang hiện
 *   }
 *   popupOwnerId?: string              // CHỈ cho phần phụ của entity ghép (marker...)
 *                                      // -> hover trúng phần phụ sẽ hiện popup của entity gốc
 *
 *   `popup` PHẢI có ngay lúc add (truyền qua options), không gán sau — nếu gán
 *   sau, sự kiện collectionChanged đã bắn xong, chế độ "hiện hết" sẽ bỏ sót.
 *
 * ── CÁCH QUẢN LÝ ──
 *   Mỗi entity có tối đa 1 PopupItem, tạo LƯỜI (lần đầu cần hiện) và GIỮ LẠI:
 *   ẩn = gỡ khỏi DOM (detach), không huỷ; hiện lại = gắn lại, không tạo lại.
 *   Chỉ huỷ thật khi entity bị xoá khỏi viewer.entities hoặc destroy() cả layer.
 *
 *   Luật hiển thị:
 *     mode HOVER: chỉ popup của entity đang hover (+ entity đang chờ ẩn)
 *     mode ALL  : popup của mọi entity có `popup` (trừ phần phụ)
 *
 *   Mỗi frame (postRender) chỉ duyệt các popup đang gắn trong DOM: tính vị
 *   trí màn hình, lọc (khuất sau địa cầu / ngoài màn hình / quá xa / entity
 *   đang ẩn), ghi transform, và gọi update() theo nhịp.
 *
 * GIỚI HẠN: chỉ theo dõi viewer.entities (không theo dõi entity trong
 * DataSource khác, ví dụ như primitives chẳng hạn, cơ mà primitives thường chỉ dùng
 * cho các loại data đặc thù không thay đổi nên nó chả cần popup làm gì).
 */

import { logger } from '../../utils/logger';
import { initMouseTracker } from '../interaction/MouseTracker';
import {
    POPUP_HOVER_HIDE_DELAY_MS,
    POPUP_MAX_DISTANCE_M,
    POPUP_MODE_ALL,
    POPUP_MODE_HOVER,
    POPUP_OFFSET_X_PX,
    POPUP_OFFSET_Y_PX,
    POPUP_UPDATE_INTERVAL_MS,
} from './PopupConstants';
import { isPopupEntity } from './PopupUtils';

// Popup có điểm neo lệch khỏi mép màn hình trong khoảng này vẫn được vẽ,
// để popup ở sát mép không bị tắt đột ngột khi vẫn còn nhìn thấy một phần.

const SCREEN_MARGIN_PX = 50;

class PopupLayer {
    constructor(viewer) {
        this._viewer = viewer;
        this._mode = POPUP_MODE_HOVER;

        /** @type {Map<string, PopupItem>} mọi popup đã tạo (kể cả đang ẩn) */
        this._items = new Map();
        /** @type {Set<PopupItem>} chỉ các popup đang gắn trong DOM */
        this._attached = new Set();

        // trạng thái hover
        this._hoveredId = null; // entity đang hover
        this._pendingHideId = null; // entity vừa rời chuột, đang đếm ngược để ẩn
        this._hideTimer = null;

        // dùng lại mỗi frame, tránh tạo object mới
        this._occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84);
        this._scratchPos = new Cesium.Cartesian3();
        this._scratchScreen = new Cesium.Cartesian2();

        // lớp phủ chứa mọi popup, nằm cùng container với canvas
        // absolute + inset-0: phủ kín canvas; pointer-events-none: không chặn
        // thao tác bản đồ; overflow-hidden: popup sát mép không làm tràn trang
        this._container = document.createElement('div');
        this._container.className = 'absolute inset-0 pointer-events-none overflow-hidden';
        viewer.cesiumWidget.container.appendChild(this._container);

        this._unsubscribeMouse = initMouseTracker(viewer).subscribe((pos) => this._onMouse(pos));
        this._removePostRender = viewer.scene.postRender.addEventListener(() =>
            this._onPostRender(),
        );
        this._removeCollectionListener = viewer.entities.collectionChanged.addEventListener(
            (collection, added, removed) => this._onCollectionChanged(added, removed),
        );
    }

    //================ public API ====================

    get mode() {
        return this._mode;
    }

    /** @param {POPUP_MODE_HOVER | POPUP_MODE_ALL} mode */
    setMode(mode) {
        if (mode === this._mode) return;
        if (mode !== POPUP_MODE_HOVER && mode !== POPUP_MODE_ALL) {
            logger.warn('[PopupLayer] mode không hợp lệ:', mode);
            return;
        }

        this._mode = mode;
        // trạng thái hover không còn ý nghĩa khi đổi mode — reset sạch
        this._resetHoverState();

        if (mode === POPUP_MODE_ALL) {
            for (const entity of this._viewer.entities.values) {
                if (isPopupEntity(entity)) this._show(entity);
            }
        } else {
            // về HOVER: gỡ hết khỏi DOM (vẫn giữ cache), chờ hover mới
            for (const item of [...this._attached]) this._detach(item);
        }
    }

    destroy() {
        this._unsubscribeMouse?.();
        this._removePostRender?.();
        this._removeCollectionListener?.();
        clearTimeout(this._hideTimer);

        this._container.remove();
        this._items.clear();
        this._attached.clear();
        this._viewer = null;
    }

    //================ hover (chỉ chạy ở mode HOVER) ====================

    /** Subscriber của MouseTracker — pos = null khi chuột rời canvas. */
    _onMouse(pos) {
        if (this._mode !== POPUP_MODE_HOVER) return;

        const entity = pos ? this._pickPopupEntity(pos) : null;
        const id = entity?.id ?? null;

        // 1. vẫn là entity đang hover -> không làm gì
        if (id === this._hoveredId) return;

        // 2. quay lại đúng entity đang chờ ẩn -> huỷ đếm ngược, giữ popup
        if (id && id === this._pendingHideId) {
            clearTimeout(this._hideTimer);
            this._pendingHideId = null;
            this._hoveredId = id;
            return;
        }

        // 3. hover sang entity MỚI -> ẩn ngay popup cũ (kể cả cái đang chờ ẩn)
        if (entity) {
            this._resetHoverState();
            this._show(entity);
            this._hoveredId = id;
            return;
        }

        // 4. rời entity ra khoảng trống (hoặc ra khỏi canvas)
        const leavingId = this._hoveredId;
        this._hoveredId = null;
        if (!leavingId) return;

        if (POPUP_HOVER_HIDE_DELAY_MS <= 0) {
            this._hideById(leavingId);
            return;
        }

        clearTimeout(this._hideTimer);
        this._pendingHideId = leavingId;
        this._hideTimer = setTimeout(() => {
            // kiểm tra lại: trong lúc chờ có thể đã hover lại / đổi mode
            if (this._pendingHideId !== leavingId) return;
            this._hideById(leavingId);
            this._pendingHideId = null;
        }, POPUP_HOVER_HIDE_DELAY_MS);
    }

    /** Pick tại vị trí chuột -> entity "chủ" có popup, hoặc null. */
    _pickPopupEntity(pos) {
        const picked = this._viewer.scene.pick(pos);
        const entity = picked?.id;
        if (!(entity instanceof Cesium.Entity)) return null;

        // phần phụ của entity ghép -> quy về entity gốc
        const owner = entity.popupOwnerId
            ? this._viewer.entities.getById(entity.popupOwnerId)
            : entity;

        return isPopupEntity(owner) ? owner : null;
    }

    /** Ẩn popup đang hover + popup đang chờ ẩn, huỷ đếm ngược. */
    _resetHoverState() {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
        this._hideById(this._hoveredId);
        this._hideById(this._pendingHideId);
        this._hoveredId = null;
        this._pendingHideId = null;
    }

    //================ vòng đời entity ====================

    _onCollectionChanged(added, removed) {
        for (const entity of removed) {
            this._destroyItem(entity.id);
            if (entity.id === this._hoveredId) this._hoveredId = null;
            if (entity.id === this._pendingHideId) {
                clearTimeout(this._hideTimer);
                this._pendingHideId = null;
            }
        }

        if (this._mode === POPUP_MODE_ALL) {
            for (const entity of added) {
                if (isPopupEntity(entity)) this._show(entity);
            }
        }
    }

    //================ quản lý PopupItem ====================

    /** Tạo (nếu chưa có) và gắn popup của entity vào DOM. */
    _show(entity) {
        const item = this._ensureItem(entity);
        if (item) this._attach(item);
    }

    _hideById(id) {
        if (!id) return;
        const item = this._items.get(id);
        if (item) this._detach(item);
    }

    /** Lấy PopupItem của entity, tạo mới nếu chưa có. Trả null nếu tạo lỗi. */
    _ensureItem(entity) {
        const existing = this._items.get(entity.id);
        // cùng id nhưng khác object = entity đã bị tạo lại -> bỏ item cũ
        if (existing && existing.entity === entity) return existing;
        if (existing) this._destroyItem(entity.id);

        let content;
        try {
            content = entity.popup.create();
        } catch (err) {
            logger.error(`[PopupLayer] popup.create() lỗi (entity ${entity.id}):`, err);
            return null;
        }
        if (!(content instanceof HTMLElement)) {
            logger.warn(
                `[PopupLayer] popup.create() phải trả về HTMLElement (entity ${entity.id})`,
            );
            return null;
        }

        // "vỏ" do layer quản lý (vị trí, hiện/ẩn); "ruột" là content của entity
        // vỏ chỉ lo định vị (gốc tại góc trên-trái, dịch bằng transform);
        // giao diện khung/nền/chữ hoàn toàn do content của entity quyết định
        const shell = document.createElement('div');
        shell.className = 'absolute left-0 top-0 will-change-transform';
        shell.appendChild(content);

        /** @typedef {object} PopupItem */
        const item = {
            entity,
            shell,
            content,
            attached: false,
            culled: true, // đang bị lọc (visibility: hidden) hay không
            lastX: NaN, // vị trí đã ghi lần trước — giống thì khỏi ghi lại
            lastY: NaN,
            lastUpdate: 0, // mốc performance.now() lần update() gần nhất
            updateFailed: false, // update() từng ném lỗi -> ngừng gọi
        };
        this._items.set(entity.id, item);
        return item;
    }

    _attach(item) {
        if (item.attached) return;

        // Gắn vào ở trạng thái ẩn: vị trí chỉ được tính ở postRender kế tiếp,
        // hiện ngay sẽ thấy popup nháy ở góc trên-trái 1 frame.
        item.culled = true;
        item.shell.style.visibility = 'hidden';
        item.lastX = item.lastY = NaN;

        this._container.appendChild(item.shell);
        item.attached = true;
        this._attached.add(item);

        // nội dung có thể đã cũ từ lần hiện trước -> làm mới ngay
        this._updateContent(item, performance.now());
    }

    _detach(item) {
        if (!item.attached) return;
        item.shell.remove();
        item.attached = false;
        this._attached.delete(item);
    }

    _destroyItem(id) {
        const item = this._items.get(id);
        if (!item) return;
        this._detach(item);
        this._items.delete(id);
    }

    _updateContent(item, now) {
        const { entity, content } = item;
        if (item.updateFailed || typeof entity.popup?.update !== 'function') return;

        item.lastUpdate = now;
        try {
            entity.popup.update(content, entity);
        } catch (err) {
            // chỉ log 1 lần, tránh spam 4 lần/giây
            item.updateFailed = true;
            logger.error(
                `[PopupLayer] popup.update() lỗi (entity ${entity.id}), ngừng cập nhật:`,
                err,
            );
        }
    }

    //================ mỗi frame ====================

    _onPostRender() {
        if (this._attached.size === 0) return;

        const viewer = this._viewer;
        const scene = viewer.scene;
        const cameraPos = scene.camera.positionWC; // dùng wc vì muốn lấy tọa độ ECEF thật, ko bị ảnh hưởng bởi lookAt()
        const time = viewer.clock.currentTime;
        const now = performance.now();

        // đọc kích thước canvas 1 LẦN trước vòng lặp (đọc layout xen kẽ
        // với ghi style trong vòng lặp sẽ ép trình duyệt tính lại layout)
        const width = scene.canvas.clientWidth;
        const height = scene.canvas.clientHeight;

        // kiểm tra khuất sau địa cầu chỉ có nghĩa ở chế độ 3D
        const checkHorizon = scene.mode === Cesium.SceneMode.SCENE3D;
        if (checkHorizon) this._occluder.cameraPosition = cameraPos;

        for (const item of this._attached) {
            const screen = this._computeScreenPosition(item.entity, time, cameraPos, checkHorizon);

            // trường hợp tọa độ nằm ngoài vùng hiển thị, như kiểu một entity tồn tại
            // với label ra ngoài camera vậy, tắt popup đi
            const offscreen =
                !screen ||
                screen.x < -SCREEN_MARGIN_PX ||
                screen.x > width + SCREEN_MARGIN_PX ||
                screen.y < -SCREEN_MARGIN_PX ||
                screen.y > height + SCREEN_MARGIN_PX;

            if (offscreen) {
                if (!item.culled) {
                    item.culled = true;
                    item.shell.style.visibility = 'hidden';
                }
                continue;
            }

            const x = Math.round(screen.x + POPUP_OFFSET_X_PX);
            const y = Math.round(screen.y + POPUP_OFFSET_Y_PX);
            if (x !== item.lastX || y !== item.lastY) {
                // translate(-50%, -100%): neo giữa-dưới theo kích thước của
                // chính popup — CSS tự tính, không phải đo bằng JS
                item.shell.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
                item.lastX = x;
                item.lastY = y;
            }

            if (item.culled) {
                item.culled = false;
                item.shell.style.visibility = '';
            }

            if (now - item.lastUpdate >= POPUP_UPDATE_INTERVAL_MS) {
                this._updateContent(item, now);
            }
        }
    }

    /**
     * Vị trí màn hình (px CSS, gốc = góc trên-trái canvas) của entity, hoặc
     * null nếu không nên hiện: entity đang ẩn, không có vị trí, quá xa, khuất
     * sau địa cầu, hoặc nằm sau camera.
     * Kết quả là object scratch dùng chung — đọc ngay, không giữ lại.
     */
    _computeScreenPosition(entity, time, cameraPos, checkHorizon) {
        if (!entity.isShowing) return null;

        const pos = entity.position?.getValue(time, this._scratchPos);
        if (!pos) return null;

        if (
            POPUP_MAX_DISTANCE_M !== Infinity &&
            Cesium.Cartesian3.distance(cameraPos, pos) > POPUP_MAX_DISTANCE_M
        ) {
            return null;
        }

        if (checkHorizon && !this._occluder.isPointVisible(pos)) return null;

        // trả undefined nếu điểm nằm sau camera
        return (
            Cesium.SceneTransforms.worldToWindowCoordinates(
                this._viewer.scene,
                pos,
                this._scratchScreen,
            ) ?? null
        );
    }
}

//================ singleton ====================

let _instance = null;

export function initPopupLayer(viewer) {
    // idempotent — StrictMode (dev) chạy effect 2 lần
    if (_instance) return _instance;
    _instance = new PopupLayer(viewer);
    return _instance;
}

export function getPopupLayer() {
    if (!_instance) {
        logger.error('PopupLayer chưa được tạo — gọi initPopupLayer(viewer) trước');
        return;
    }
    return _instance;
}

export function destroyPopupLayer() {
    _instance?.destroy();
    _instance = null;
}
