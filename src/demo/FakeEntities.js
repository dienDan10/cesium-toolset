/**
 * Entity giả để test PopupLayer trên demo. KHÔNG mang sang project chính.
 *
 * Sinh ra đủ các loại entity mà PopupLayer phải xử lý:
 *   - tĩnh          : popup chỉ có create(), nội dung cố định
 *   - di chuyển     : bay vòng tròn, popup có update() hiện tốc độ/hướng realtime
 *   - ghép          : entity gốc + marker phụ (popupOwnerId) — hover marker
 *                     phải hiện popup của entity gốc
 *   - không popup   : hover vào phải coi như khoảng trống
 * Và định kỳ xoá / thêm entity (mô phỏng DROP), thỉnh thoảng tạo lại đúng
 * id cũ — để test collectionChanged và trường hợp "cùng id, khác object".
 *
 * LƯU Ý: entity đặt ở độ cao cố định (mặc định 2000 m), KHÔNG clamp xuống
 * terrain. Popup neo theo entity.position; nếu entity dùng CLAMP_TO_GROUND
 * thì điểm vẽ thật (trên mặt núi) khác entity.position (độ cao gốc) -> popup
 * sẽ lệch khỏi icon khi nhìn nghiêng. Demo tránh vấn đề đó để test phần lõi.
 */

const KM_PER_DEG_LAT = 111.32;

// tỉ lệ các loại entity (phần còn lại là entity tĩnh)
const RATIO_MOVING = 0.6;
const RATIO_COMPOSITE = 0.1;
const RATIO_NO_POPUP = 0.05;

const KIND_COLORS = {
    static: Cesium.Color.fromCssColorString('#38bdf8'), // xanh dương
    moving: Cesium.Color.fromCssColorString('#f59e0b'), // hổ phách
    composite: Cesium.Color.fromCssColorString('#a78bfa'), // tím
    noPopup: Cesium.Color.fromCssColorString('#737373'), // xám
};

/**
 * @param {Cesium.Viewer} viewer
 * @param {object} [options]
 * @param {number} [options.count=300]           số entity (không tính marker phụ)
 * @param {number[]} [options.center]            [lon, lat] tâm vùng rải entity
 * @param {number} [options.spreadKm=60]         bán kính vùng rải (km)
 * @param {number} [options.height=2000]         độ cao entity (m)
 * @param {number} [options.churnMs=3000]        chu kỳ xoá/thêm entity (ms), 0 = tắt
 * @returns {{ destroy: () => void }}
 */
export function spawnFakeEntities(
    viewer,
    { count = 300, center = [105.3, 21.0], spreadKm = 60, height = 2000, churnMs = 3000 } = {},
) {
    const epoch = viewer.clock.currentTime.clone();
    const markerImage = createMarkerImage();
    /** @type {Map<string, string[]>} id gốc -> mọi id cần xoá cùng (gốc + marker) */
    const groups = new Map();
    let seq = 0;

    const randomPoint = () => {
        const r = Math.sqrt(Math.random()) * spreadKm; // sqrt -> rải đều theo diện tích
        const a = Math.random() * Math.PI * 2;
        const dLat = (r * Math.sin(a)) / KM_PER_DEG_LAT;
        const dLon =
            (r * Math.cos(a)) / (KM_PER_DEG_LAT * Math.cos(Cesium.Math.toRadians(center[1])));
        return [center[0] + dLon, center[1] + dLat];
    };

    const pickKind = () => {
        const x = Math.random();
        if (x < RATIO_NO_POPUP) return 'noPopup';
        if (x < RATIO_NO_POPUP + RATIO_COMPOSITE) return 'composite';
        if (x < RATIO_NO_POPUP + RATIO_COMPOSITE + RATIO_MOVING) return 'moving';
        return 'static';
    };

    function addEntity(id = `demo-${seq++}`, kind = pickKind()) {
        const [lon, lat] = randomPoint();
        const name = `${kind.toUpperCase()} ${id.replace('demo-', '#')}`;
        const point = {
            pixelSize: 9,
            color: KIND_COLORS[kind],
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
        };

        if (kind === 'moving') {
            // bay vòng tròn bán kính 2–8 km, tốc độ 150–600 km/h
            const radiusKm = 2 + Math.random() * 6;
            const demo = { speedKmh: 150 + Math.random() * 450, headingDeg: 0 };
            const phase0 = Math.random() * Math.PI * 2;
            const scratch = new Cesium.Cartesian3();

            viewer.entities.add({
                id,
                name,
                point,
                demo, // dữ liệu "realtime" — bộ mô phỏng WebSocket bên dưới sửa định kỳ
                position: new Cesium.CallbackProperty((time, result) => {
                    const t = Cesium.JulianDate.secondsDifference(time, epoch);
                    const omega = demo.speedKmh / 3600 / radiusKm; // rad/s
                    const phase = phase0 + omega * t;
                    // bay ngược chiều kim đồng hồ: vận tốc ∝ (-sin φ, cos φ) theo
                    // (Đông, Bắc) -> hướng la bàn = atan2(-sin φ, cos φ) = -φ
                    demo.headingDeg = ((-Cesium.Math.toDegrees(phase) % 360) + 360) % 360;
                    const dLat = (radiusKm * Math.sin(phase)) / KM_PER_DEG_LAT;
                    const dLon =
                        (radiusKm * Math.cos(phase)) /
                        (KM_PER_DEG_LAT * Math.cos(Cesium.Math.toRadians(lat)));
                    return Cesium.Cartesian3.fromDegrees(
                        lon + dLon,
                        lat + dLat,
                        height,
                        Cesium.Ellipsoid.WGS84,
                        result ?? scratch,
                    );
                }, false),
                popup: createMovingPopup(name),
            });
            groups.set(id, [id]);
            return;
        }

        const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);

        if (kind === 'composite') {
            const markerId = `${id}-marker`;
            viewer.entities.add({
                id,
                name,
                position,
                point,
                popup: createStaticPopup(name, 'Entity ghép — gốc'),
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
                },
            });
            groups.set(id, [id, markerId]);
            return;
        }

        viewer.entities.add({
            id,
            name,
            position,
            point,
            popup: kind === 'static' ? createStaticPopup(name, 'Entity tĩnh') : undefined,
        });
        groups.set(id, [id]);
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

    // mô phỏng dữ liệu WebSocket: tốc độ dao động nhẹ
    const dataTimer = setInterval(() => {
        for (const id of groups.keys()) {
            const demo = viewer.entities.getById(id)?.demo;
            if (demo) demo.speedKmh = Math.max(100, demo.speedKmh + (Math.random() - 0.5) * 20);
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

function createMovingPopup(name) {
    return {
        create() {
            const el = document.createElement('div');
            el.className = FRAME_CLASS;
            el.innerHTML = `
                <div data-field="name" class="font-bold text-amber-400"></div>
                <div class="text-neutral-400">Tốc độ: <span data-field="speed" class="text-amber-300"></span></div>
                <div class="text-neutral-400">Hướng: <span data-field="heading" class="text-amber-300"></span></div>`;
            el.querySelector('[data-field="name"]').textContent = name;
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
    ctx.fillStyle = '#a78bfa';
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
