import * as CesiumNS from 'cesium';

// Cho phép dùng `Cesium.*` như biến global (đúng cách code hiện tại đang gọi)
// mà vẫn có đầy đủ autocomplete + type checking từ npm package `cesium`.
// Không cần thêm dòng /// <reference path="..." /> ở từng file nữa —
// VSCode/TS tự nhận file .d.ts này trong toàn bộ project.
declare global {
    const Cesium: typeof CesiumNS;
}

export {};
