import { logger } from '../../utils/logger';

export function formatDistanceText(meters) {
    if (!Number.isFinite(meters)) {
        return '0 m';
    }

    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }

    const km = meters / 1000;

    return `${km.toLocaleString('vi-VN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })} km`;
}

export function formatAreaText(squareMeters) {
    if (!Number.isFinite(squareMeters) || squareMeters < 0) {
        return '0 m²';
    }

    if (squareMeters < 1_000_000) {
        return `${Math.round(squareMeters).toLocaleString('vi-VN')} m²`;
    }

    return `${(squareMeters / 1_000_000).toLocaleString('vi-VN', {
        maximumFractionDigits: 2,
    })} km²`;
}

// scene.globe.getHeight() trả undefined nếu terrain tile tại đúng vị trí
// đó chưa load — fallback về 0 (coi như mực nước biển) thay vì crash.
// Log cảnh báo 1 lần duy nhất mỗi phiên đo, tránh spam console.
export function makeHeightSampler(viewer) {
    let warned = false;
    return function sampleHeight(cartographic) {
        const height = viewer.scene.globe.getHeight(cartographic);
        if (height === undefined) {
            if (!warned) {
                logger.warn(
                    '[MeasureV2] Terrain chưa load tại 1 điểm sample — dùng fallback 0m. ' +
                        'Kết quả đo có thể thiếu chính xác ở khu vực đó.',
                );
                warned = true;
            }
            return 0;
        }
        return height;
    };
}

// đổi tọa độ cartographic sang cartesian3 kèm height
export function cartesian3FromCartographic(cartographic, height) {
    return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, height);
}

// Style đường/hình vẽ khi đo — khớp màu amber đang dùng cho toolbar/settings
// (amber-500 #f59e0b). Polyline dùng `material`+`width`; polygon cần thêm
// `outlineColor`/`outlineWidth` riêng vì Drawer tự vẽ viền bằng 1 polyline
// phụ dựa theo 2 field này (xem Polygon.createShape trong drawer package),
// không phải property gốc của PolygonGraphics.
//
// LƯU Ý: outlineWidth > 1 không có tác dụng trên hầu hết trình duyệt
// (giới hạn WebGL, Chrome luôn clamp về 1px bất kể giá trị truyền vào) —
// đừng ngạc nhiên nếu đổi số mà viền không dày lên trên Chrome.
export const distanceLineStyle = {
    material: Cesium.Color.fromCssColorString('#f59e0b'),
    width: 2,
};

export const areaPolygonStyle = {
    material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.25),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#f59e0b'),
    outlineWidth: 2,
};
