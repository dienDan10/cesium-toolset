import { AreaMeasure } from '@cesium-extends/measure';
import { polygon } from '@turf/helpers';
import intersect from '@turf/intersect';
import { makeHeightSampler } from './MeasureUtils';
import { logger } from '../../utils/logger';

// Xấp xỉ — CHỈ dùng để quy đổi kích thước ô lưới (mét -> độ). Không tham
// gia vào phép tính diện tích, nên sai lệch nhỏ ở đây chỉ làm ô to/nhỏ hơn
// chút, không làm sai kết quả.
const METERS_PER_DEG_LAT = 111_320;

// turf `intersect` trả Polygon HOẶC MultiPolygon (ô lưới giao với đa giác
// không lồi có thể bị cắt rời thành nhiều mảnh) — chuẩn hoá về danh sách
// outer ring. Đa giác vẽ tay không có lỗ, nên phép cắt không sinh ra lỗ.
function getOuterRings(geometry) {
    if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly) => poly[0]);
    return [];
}

// Diện tích 3D của 1 đa giác theo công thức Newell (vector area):
// A = |Σ (p_i - o) × (p_{i+1} - o)| / 2.
// - Chính xác tuyệt đối với mảnh phẳng (kể cả nghiêng), không phụ thuộc
//   hướng lưới so với sườn dốc — khác phép "trải phẳng" cũ.
// - Chạy đúng với mảnh không lồi (không cần tam giác hoá).
// - Mảnh không phẳng (vênh): cho diện tích của mặt phẳng trung bình — ô
//   càng nhỏ thì mảnh càng gần phẳng, sai số càng nhỏ.
// - Trừ gốc `o` trước khi nhân chéo để tránh mất chính xác với toạ độ ECEF
//   cỡ 6.4e6 m.
function polygonArea3D(positions) {
    const o = positions[0];
    const sum = new Cesium.Cartesian3();
    const a = new Cesium.Cartesian3();
    const b = new Cesium.Cartesian3();
    const c = new Cesium.Cartesian3();
    for (let i = 0; i < positions.length; i += 1) {
        Cesium.Cartesian3.subtract(positions[i], o, a);
        Cesium.Cartesian3.subtract(positions[(i + 1) % positions.length], o, b);
        Cesium.Cartesian3.add(sum, Cesium.Cartesian3.cross(a, b, c), sum);
    }
    return Cesium.Cartesian3.magnitude(sum) / 2;
}

// Ray casting (even-odd) trên lon/lat — chỉ dùng để phân loại tâm ô là
// trong hay ngoài đa giác, ở quy mô này coi lon/lat như mặt phẳng là đủ.
function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// Sutherland–Hodgman: cắt 1 vòng (hở) theo hình chữ nhật. Dùng làm
// PHƯƠNG ÁN DỰ PHÒNG khi turf `intersect` ném lỗi — polygon-clipping (bên
// dưới turf v6) thỉnh thoảng ném "Unable to complete output ring" do lỗi
// làm tròn số thực. Thuật toán này không bao giờ ném lỗi và cho diện tích
// 2D đúng; nhược điểm: đa giác lõm bị cắt rời thành nhiều mảnh sẽ ra 1 vòng
// duy nhất nối các mảnh bằng cạnh "cầu" chạy dọc biên ô, gây sai lệch 3D
// rất nhỏ — chấp nhận được vì chỉ áp cho số ít ô gặp lỗi.
function clipRingToRect(ring, x0, y0, x1, y1) {
    const atX = (a, b, x) => [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
    const atY = (a, b, y) => [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y];
    const planes = [
        [(p) => p[0] >= x0, (a, b) => atX(a, b, x0)],
        [(p) => p[0] <= x1, (a, b) => atX(a, b, x1)],
        [(p) => p[1] >= y0, (a, b) => atY(a, b, y0)],
        [(p) => p[1] <= y1, (a, b) => atY(a, b, y1)],
    ];
    let out = ring;
    for (const [inside, cross] of planes) {
        const input = out;
        out = [];
        for (let i = 0; i < input.length; i += 1) {
            const cur = input[i];
            const prev = input[(i + input.length - 1) % input.length];
            if (inside(cur)) {
                if (!inside(prev)) out.push(cross(prev, cur));
                out.push(cur);
            } else if (inside(prev)) {
                out.push(cross(prev, cur));
            }
        }
        if (out.length === 0) break;
    }
    return out;
}

// Chỉ log 1 lần mỗi phiên — getArea bị gọi liên tục theo chuột lúc vẽ.
let clipErrorLogged = false;

/**
 * Tính diện tích bám đất — hàm thuần, không phụ thuộc viewer (test được).
 *
 * @param {number[][]} lonlats   đỉnh đa giác [lon, lat] (độ), vòng HỞ
 * @param {(carto: Cesium.Cartographic) => number} sampleHeight
 * @param {{ cellSizeM: number, maxCells: number }} opts
 */
export function computeSurfaceArea(rawLonlats, sampleHeight, { cellSizeM, maxCells }) {
    // Bỏ đỉnh trùng liên tiếp (vd nhấp đúp kết thúc có thể thêm 2 điểm
    // trùng nhau) — input gần suy biến là loại dễ làm polygon-clipping lỗi.
    const lonlats = rawLonlats.filter((p, i) => {
        const q = rawLonlats[(i + rawLonlats.length - 1) % rawLonlats.length];
        return Math.abs(p[0] - q[0]) > 1e-12 || Math.abs(p[1] - q[1]) > 1e-12;
    });
    if (lonlats.length < 3) return 0;

    const lons = lonlats.map((p) => p[0]);
    const lats = lonlats.map((p) => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Số ô theo KÍCH THƯỚC THẬT (mét), không cố định theo số ô như bản cũ —
    // bản cũ để polygon 20km có ô 2km, bỏ qua toàn bộ địa hình trong ô.
    const midLatRad = Cesium.Math.toRadians((minLat + maxLat) / 2);
    const widthM = (maxLon - minLon) * METERS_PER_DEG_LAT * Math.cos(midLatRad);
    const heightM = (maxLat - minLat) * METERS_PER_DEG_LAT;
    // đa giác suy biến (0 chiều rộng hoặc cao) -> không chia lưới được
    if (!(widthM > 0) || !(heightM > 0)) return 0;

    let nLon = Math.max(1, Math.ceil(widthM / cellSizeM));
    let nLat = Math.max(1, Math.ceil(heightM / cellSizeM));
    // Trần tổng số ô: polygon lớn thì ô tự to ra (giữ tỉ lệ 2 trục) để
    // không vượt ngân sách tính toán.
    if (nLon * nLat > maxCells) {
        const k = Math.sqrt(maxCells / (nLon * nLat));
        nLon = Math.max(1, Math.floor(nLon * k));
        nLat = Math.max(1, Math.floor(nLat * k));
    }
    const stepLon = (maxLon - minLon) / nLon;
    const stepLat = (maxLat - minLat) / nLat;

    const mainPoly = polygon([[...lonlats, lonlats[0]]]);

    // Bounding box từng cạnh đa giác — ô không chạm bbox cạnh nào thì chắc
    // chắn nằm TRỌN trong hoặc TRỌN ngoài, khỏi phải gọi turf intersect.
    const edgeBoxes = lonlats.map(([x0, y0], i) => {
        const [x1, y1] = lonlats[(i + 1) % lonlats.length];
        return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    });

    // Mỗi nút lưới dùng chung cho tối đa 4 ô — cache để chỉ lấy độ cao 1 lần.
    const heightCache = new Map();
    const toCartesian = (lon, lat) => {
        const key = `${lon.toFixed(9)},${lat.toFixed(9)}`;
        let h = heightCache.get(key);
        if (h === undefined) {
            h = sampleHeight(Cesium.Cartographic.fromDegrees(lon, lat));
            heightCache.set(key, h);
        }
        return Cesium.Cartesian3.fromDegrees(lon, lat, h);
    };

    let total = 0;
    for (let i = 0; i < nLon; i += 1) {
        // tính toạ độ nút từ min + k*step (không cộng dồn) để 2 ô kề nhau
        // ra đúng cùng 1 số -> trúng cache
        const lon0 = minLon + i * stepLon;
        const lon1 = minLon + (i + 1) * stepLon;
        for (let j = 0; j < nLat; j += 1) {
            const lat0 = minLat + j * stepLat;
            const lat1 = minLat + (j + 1) * stepLat;

            const touchesEdge = edgeBoxes.some(
                ([x0, y0, x1, y1]) => x0 <= lon1 && x1 >= lon0 && y0 <= lat1 && y1 >= lat0,
            );

            if (!touchesEdge) {
                if (!pointInRing((lon0 + lon1) / 2, (lat0 + lat1) / 2, lonlats)) continue;
                total += polygonArea3D([
                    toCartesian(lon0, lat0),
                    toCartesian(lon1, lat0),
                    toCartesian(lon1, lat1),
                    toCartesian(lon0, lat1),
                ]);
                continue;
            }

            const cell = polygon([
                [
                    [lon0, lat0],
                    [lon1, lat0],
                    [lon1, lat1],
                    [lon0, lat1],
                    [lon0, lat0],
                ],
            ]);
            let rings;
            try {
                const clipped = intersect(mainPoly, cell);
                // ring của turf là vòng KÍN (điểm cuối = điểm đầu) — bỏ điểm cuối
                rings = clipped?.geometry
                    ? getOuterRings(clipped.geometry).map((r) => r.slice(0, -1))
                    : []; // ô ngoài đa giác
            } catch (err) {
                if (!clipErrorLogged) {
                    clipErrorLogged = true;
                    logger.warn(
                        '[AreaSurfaceMeasureV2] turf intersect lỗi, dùng Sutherland–Hodgman cho ô này.',
                        err.message,
                        JSON.stringify({ polygon: lonlats, cell: [lon0, lat0, lon1, lat1] }),
                    );
                }
                rings = [clipRingToRect(lonlats, lon0, lat0, lon1, lat1)];
            }

            for (const ring of rings) {
                if (ring.length < 3) continue;
                total += polygonArea3D(ring.map(([lon, lat]) => toCartesian(lon, lat)));
            }
        }
    }
    return total;
}

/**
 * Diện tích bám đất: lưới đều theo mét phủ bounding box -> ô nằm trọn
 * trong đa giác tính thẳng, ô ở biên cắt bằng turf intersect -> lấy độ
 * cao thật từng đỉnh mảnh -> diện tích 3D mỗi mảnh theo Newell -> cộng dồn.
 *
 * options:
 *   cellSizeM  kích thước ô mong muốn (m), mặc định 30
 *   maxCells   trần số ô khi vẽ live, mặc định 900
 * getArea(positions, { maxCells }) cho phép gọi với trần cao hơn khi chốt
 * kết quả cuối (onEnd), vì lúc đó không bị gọi liên tục theo chuột.
 */
export class AreaSurfaceMeasureV2 extends AreaMeasure {
    constructor(viewer, options = {}) {
        super(viewer, options);
        this._cellSizeM = options.cellSizeM ?? 30;
        this._maxCells = options.maxCells ?? 100;
        this._sampleHeight = makeHeightSampler(viewer);
    }

    getArea(positions, { maxCells = this._maxCells } = {}) {
        const lonlats = this._cartesian2Lonlat(positions); // kế thừa từ AreaMeasure
        return computeSurfaceArea(lonlats, this._sampleHeight, {
            cellSizeM: this._cellSizeM,
            maxCells,
        });
    }
}
