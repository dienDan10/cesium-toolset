/**
 * Entity giả để test PopupLayer trên demo. KHÔNG mang sang project chính.
 *
 * Sinh ra đủ các loại entity mà PopupLayer phải xử lý:
 *   - air          : bay vòng tròn ở độ cao cố định, popup update() realtime
 *   - ground       : xe chạy vòng tròn, CLAMP_TO_GROUND, popup update() realtime
 *   - groundStatic : đứng yên, CLAMP_TO_GROUND
 *   - relative     : đứng yên, RELATIVE_TO_GROUND (+300 m so với mặt đất)
 *   - composite    : entity gốc + marker phụ (popupOwnerId), cả 2 CLAMP_TO_GROUND —
 *                    hover marker phải hiện popup của entity gốc
 *   - static       : đứng yên ở độ cao cố định, popup chỉ có create()
 *   - noPopup      : hover vào phải coi như khoảng trống
 * Và định kỳ xoá / thêm entity (mô phỏng DROP), thỉnh thoảng tạo lại đúng
 * id cũ — để test collectionChanged và trường hợp "cùng id, khác object".
 *
 * Entity clamp có entity.position ở độ cao 0 (giống project chính: tạo bằng
 * fromDegrees(lon, lat)) trong khi Cesium vẽ trên mặt terrain -> dùng để
 * kiểm tra popup có neo đúng trên icon khi nhìn nghiêng vào núi không.
 * Tâm mặc định [105.3, 21.0] là vùng đồi núi Ba Vì – Hoà Bình.
 */

const KM_PER_DEG_LAT = 111.32;

// tỉ lệ các loại entity (phần còn lại là 'static')
const KIND_RATIOS = [
    ['air', 0.35],
    ['ground', 0.2],
    ['groundStatic', 0.15],
    ['composite', 0.1],
    ['relative', 0.05],
    ['noPopup', 0.05],
];

const KIND_COLORS = {
    air: '#f59e0b', // hổ phách
    ground: '#4ade80', // xanh lá
    groundStatic: '#16a34a', // xanh lá đậm
    relative: '#f472b6', // hồng
    composite: '#a78bfa', // tím
    static: '#38bdf8', // xanh dương
    noPopup: '#737373', // xám
};

const CLAMP = Cesium.HeightReference.CLAMP_TO_GROUND;
const RELATIVE = Cesium.HeightReference.RELATIVE_TO_GROUND;
const RELATIVE_HEIGHT_M = 300;

/**
 * @param {Cesium.Viewer} viewer
 * @param {object} [options]
 * @param {number} [options.count=300]           số entity (không tính marker phụ)
 * @param {number[]} [options.center]            [lon, lat] tâm vùng rải entity
 * @param {number} [options.spreadKm=60]         bán kính vùng rải (km)
 * @param {number} [options.airHeight=2000]      độ cao entity bay / tĩnh không clamp (m)
 * @param {number} [options.churnMs=3000]        chu kỳ xoá/thêm entity (ms), 0 = tắt
 * @returns {{ destroy: () => void }}
 */
export function spawnFakeEntities(
    viewer,
    { count = 300, center = [105.3, 21.0], spreadKm = 60, airHeight = 2000, churnMs = 3000 } = {},
) {
    const epoch = viewer.clock.currentTime.clone();
    const markerImage = createMarkerImage();
    /** @type {Map<string, string[]>} id gốc -> mọi id cần xoá cùng (gốc + marker) */
    const groups = new Map();
    let seq = 0;

    const kmToDegLon = (km, lat) => km / (KM_PER_DEG_LAT * Math.cos(Cesium.Math.toRadians(lat)));

    const randomPoint = () => {
        const r = Math.sqrt(Math.random()) * spreadKm; // sqrt -> rải đều theo diện tích
        const a = Math.random() * Math.PI * 2;
        return [
            center[0] + kmToDegLon(r * Math.cos(a), center[1]),
            center[1] + (r * Math.sin(a)) / KM_PER_DEG_LAT,
        ];
    };

    const pickKind = () => {
        let x = Math.random();
        for (const [kind, ratio] of KIND_RATIOS) {
            if (x < ratio) return kind;
            x -= ratio;
        }
        return 'static';
    };

    const makePoint = (kind, heightReference) => ({
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString(KIND_COLORS[kind]),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        heightReference,
        // icon trên mặt đất không bị terrain che/nhấp nháy (thường gặp với point clamp)
        disableDepthTestDistance: heightReference ? Number.POSITIVE_INFINITY : undefined,
    });

    /** Position chạy vòng tròn quanh (lon, lat); cập nhật demo.headingDeg theo hướng chạy. */
    function circularPosition(lon, lat, height, radiusKm, demo) {
        const phase0 = Math.random() * Math.PI * 2;
        const scratch = new Cesium.Cartesian3();
        return new Cesium.CallbackProperty((time, result) => {
            const t = Cesium.JulianDate.secondsDifference(time, epoch);
            const phase = phase0 + (demo.speedKmh / 3600 / radiusKm) * t; // omega = v / r (rad/s)
            // chạy ngược chiều kim đồng hồ: vận tốc ∝ (-sin φ, cos φ) theo
            // (Đông, Bắc) -> hướng la bàn = atan2(-sin φ, cos φ) = -φ
            demo.headingDeg = ((-Cesium.Math.toDegrees(phase) % 360) + 360) % 360;
            return Cesium.Cartesian3.fromDegrees(
                lon + kmToDegLon(radiusKm * Math.cos(phase), lat),
                lat + (radiusKm * Math.sin(phase)) / KM_PER_DEG_LAT,
                height,
                Cesium.Ellipsoid.WGS84,
                result ?? scratch,
            );
        }, false);
    }

    function addEntity(id = `demo-${seq++}`, kind = pickKind()) {
        const [lon, lat] = randomPoint();
        const name = `${kind.toUpperCase()} ${id.replace('demo-', '#')}`;

        switch (kind) {
            case 'air':
            case 'ground': {
                // air: bay 150–600 km/h, vòng 2–8 km; ground: chạy 20–80 km/h, vòng 0,5–2 km
                const isAir = kind === 'air';
                const demo = {
                    speedKmh: isAir ? 150 + Math.random() * 450 : 20 + Math.random() * 60,
                    minSpeedKmh: isAir ? 100 : 10,
                    headingDeg: 0,
                };
                const radiusKm = isAir ? 2 + Math.random() * 6 : 0.5 + Math.random() * 1.5;
                viewer.entities.add({
                    id,
                    name,
                    demo, // dữ liệu "realtime" — bộ mô phỏng WebSocket bên dưới sửa định kỳ
                    position: circularPosition(lon, lat, isAir ? airHeight : 0, radiusKm, demo),
                    point: makePoint(kind, isAir ? undefined : CLAMP),
                    popup: createMovingPopup(
                        name,
                        isAir ? 'Bay — độ cao cố định' : 'Mặt đất — CLAMP',
                    ),
                });
                groups.set(id, [id]);
                return;
            }

            case 'composite': {
                const markerId = `${id}-marker`;
                const position = Cesium.Cartesian3.fromDegrees(lon, lat); // độ cao 0, clamp
                viewer.entities.add({
                    id,
                    name,
                    position,
                    point: makePoint(kind, CLAMP),
                    popup: createStaticPopup(name, 'Entity ghép — gốc, CLAMP'),
                });
                // marker phụ: KHÔNG có popup, trỏ về entity gốc qua popupOwnerId
                viewer.entities.add({
                    id: markerId,
                    position,
                    popupOwnerId: id,
                    billboard: {
                        image: markerImage,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -8),
                        heightReference: CLAMP,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                });
                groups.set(id, [id, markerId]);
                return;
            }

            case 'groundStatic':
            case 'relative': {
                const isRelative = kind === 'relative';
                viewer.entities.add({
                    id,
                    name,
                    position: Cesium.Cartesian3.fromDegrees(
                        lon,
                        lat,
                        isRelative ? RELATIVE_HEIGHT_M : 0,
                    ),
                    point: makePoint(kind, isRelative ? RELATIVE : CLAMP),
                    popup: createStaticPopup(
                        name,
                        isRelative
                            ? `RELATIVE — +${RELATIVE_HEIGHT_M} m so với mặt đất`
                            : 'Mặt đất — CLAMP',
                    ),
                });
                groups.set(id, [id]);
                return;
            }

            default: {
                // 'static' | 'noPopup' — độ cao cố định, không clamp
                viewer.entities.add({
                    id,
                    name,
                    position: Cesium.Cartesian3.fromDegrees(lon, lat, airHeight),
                    point: makePoint(kind),
                    popup:
                        kind === 'static'
                            ? createStaticPopup(name, 'Tĩnh — độ cao cố định')
                            : undefined,
                });
                groups.set(id, [id]);
            }
        }
    }

    function removeGroup(id) {
        for (const eid of groups.get(id) ?? []) viewer.entities.removeById(eid);
        groups.delete(id);
    }

    // gom thay đổi hàng loạt -> collectionChanged chỉ bắn 1 lần
    viewer.entities.suspendEvents();
    for (let i = 0; i < count; i += 1) addEntity();
    viewer.entities.resumeEvents();

    // mô phỏng DROP / entity mới; 1/3 số lần tạo lại ĐÚNG id vừa xoá
    const churnTimer =
        churnMs > 0 &&
        setInterval(() => {
            const ids = [...groups.keys()];
            if (ids.length === 0) return;
            const victim = ids[Math.floor(Math.random() * ids.length)];
            removeGroup(victim);
            addEntity(Math.random() < 1 / 3 ? victim : undefined);
        }, churnMs);

    // mô phỏng dữ liệu WebSocket: tốc độ dao động nhẹ (±5%)
    const dataTimer = setInterval(() => {
        for (const id of groups.keys()) {
            const demo = viewer.entities.getById(id)?.demo;
            if (demo) {
                const jitter = (Math.random() - 0.5) * 0.1 * demo.speedKmh;
                demo.speedKmh = Math.max(demo.minSpeedKmh, demo.speedKmh + jitter);
            }
        }
    }, 500);

    return {
        destroy() {
            if (churnTimer) clearInterval(churnTimer);
            clearInterval(dataTimer);
            viewer.entities.suspendEvents();
            for (const id of [...groups.keys()]) removeGroup(id);
            viewer.entities.resumeEvents();
        },
    };
}

//================ popup mẫu ====================

const FRAME_CLASS =
    'border border-amber-700/70 bg-neutral-950/85 px-2 py-1 font-mono text-[11px] leading-tight whitespace-nowrap';

function createStaticPopup(name, note) {
    return {
        create() {
            const el = document.createElement('div');
            el.className = FRAME_CLASS;
            el.innerHTML = `
                <div data-field="name" class="font-bold text-amber-400"></div>
                <div data-field="note" class="text-neutral-400"></div>`;
            // giá trị động ghi bằng textContent, không nhét vào innerHTML
            el.querySelector('[data-field="name"]').textContent = name;
            el.querySelector('[data-field="note"]').textContent = note;
            return el;
        },
        // không có update() -> PopupLayer không bao giờ cập nhật popup này
    };
}

function createMovingPopup(name, note) {
    return {
        create() {
            const el = document.createElement('div');
            el.className = FRAME_CLASS;
            el.innerHTML = `
                <div data-field="name" class="font-bold text-amber-400"></div>
                <div data-field="note" class="text-neutral-500"></div>
                <div class="text-neutral-400">Tốc độ: <span data-field="speed" class="text-amber-300"></span></div>
                <div class="text-neutral-400">Hướng: <span data-field="heading" class="text-amber-300"></span></div>`;
            el.querySelector('[data-field="name"]').textContent = name;
            el.querySelector('[data-field="note"]').textContent = note;
            return el;
        },
        update(el, entity) {
            const { speedKmh, headingDeg } = entity.demo;
            el.querySelector('[data-field="speed"]').textContent = `${speedKmh.toFixed(0)} km/h`;
            el.querySelector('[data-field="heading"]').textContent = `${headingDeg.toFixed(0)}°`;
        },
    };
}

/** Icon tam giác cho marker phụ — vẽ 1 lần bằng canvas, dùng chung. */
function createMarkerImage() {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = KIND_COLORS.composite;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(size / 2, size - 1);
    ctx.lineTo(1, 1);
    ctx.lineTo(size - 1, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return canvas.toDataURL();
}
