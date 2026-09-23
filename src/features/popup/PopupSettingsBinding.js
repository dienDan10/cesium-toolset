import { useUiSettingsStore } from '../settings/UseUISettingsStore';
import { getPopupLayer } from '../../cesium/popup/PopupLayer';
import { POPUP_MODE_ALL, POPUP_MODE_HOVER } from '../../cesium/popup/PopupConstants';

/**
 * Nối setting `showAllPopups` -> PopupLayer.setMode().
 *
 * Cố ý KHÔNG làm thành React hook: React chạy effect của component con TRƯỚC
 * component cha, nên 1 hook đặt trong component con sẽ chạy khi viewer (tạo
 * trong effect của App) và PopupLayer chưa tồn tại. Zustand cho subscribe
 * store ngoài React -> gọi hàm này ngay sau initPopupLayer(viewer) là thứ tự
 * luôn đúng, không phụ thuộc vị trí đặt code trong component.
 *
 * Thứ tự gọi:
 *   initPopupLayer(viewer);
 *   bindPopupSettings();
 */

let _unsubscribe = null;

function applyMode(showAll) {
    getPopupLayer()?.setMode(showAll ? POPUP_MODE_ALL : POPUP_MODE_HOVER);
}

export function bindPopupSettings() {
    // idempotent — StrictMode (dev) chạy effect khởi tạo 2 lần; không có dòng
    // này sẽ đăng ký 2 subscriber (setMode bị gọi 2 lần mỗi khi đổi setting)
    if (_unsubscribe) return;

    // subscribe chỉ báo khi store THAY ĐỔI -> phải tự áp giá trị hiện tại 1 lần
    applyMode(useUiSettingsStore.getState().values.showAllPopups);

    // subscribe() ngoài React KHÔNG có selector: listener được gọi với MỌI
    // thay đổi của store (kể cả setting khác) -> tự so sánh, chỉ xử lý khi
    // đúng showAllPopups đổi. (Hook `useUiSettingsStore(selector)` trong
    // component thì React tự làm bước so sánh này; ngoài React phải tự làm,
    // hoặc thêm middleware subscribeWithSelector vào store.)
    _unsubscribe = useUiSettingsStore.subscribe((state, prevState) => {
        const showAll = state.values.showAllPopups;
        if (showAll === prevState.values.showAllPopups) return;
        applyMode(showAll);
    });
}

export function unbindPopupSettings() {
    _unsubscribe?.();
    _unsubscribe = null;
}
