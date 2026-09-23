import { DistanceMeasure } from '@cesium-extends/measure';
import { DistanceSurfaceMeasureV2 } from './DistanceSurfaceMeasureV2';
import { FlatAreaMeasureV2 } from './FlatAreaMeasureV2';
import { AreaSurfaceMeasureV2 } from './AreaSurfaceMeasureV2';
import { useUiSettingsStore } from '../settings/UseUISettingsStore';
import { useEffect, useRef, useState } from 'react';
import {
    areaPolygonStyle,
    distanceLineStyle,
    formatAreaText,
    formatDistanceText,
} from './MeasureUtils';
import { logger } from '../../utils/logger';
import { getViewer } from '../../cesium/init/viewer';
import {
    AREA_SAMPLE_CELL,
    SURFACE_OPTION_FLAT,
    SURFACE_OPTION_GROUND,
    TYPE_OPTION_AREA,
    TYPE_OPTION_DISTANCE,
} from './MeasureConstants';

const MEASURE_CLASSES = {
    [`${TYPE_OPTION_DISTANCE}-${SURFACE_OPTION_FLAT}`]: DistanceMeasure,
    [`${TYPE_OPTION_DISTANCE}-${SURFACE_OPTION_GROUND}`]: DistanceSurfaceMeasureV2,
    [`${TYPE_OPTION_AREA}-${SURFACE_OPTION_FLAT}`]: FlatAreaMeasureV2,
    [`${TYPE_OPTION_AREA}-${SURFACE_OPTION_GROUND}`]: AreaSurfaceMeasureV2,
};

function destroyMeasurement(m) {
    if (m.instance && !m.instance.destroyed) m.instance.destroy();
}

export function useMeasureToolbar() {
    const showMeasure = useUiSettingsStore((s) => s.values.showMeasure);
    const [type, setType] = useState('distance');
    const [surface, setSurface] = useState('flat');
    const [liveResult, setLiveResult] = useState(null);
    const [measurements, setMeasurements] = useState([]);
    const [resetKey, setResetKey] = useState(0);
    const lastValueRef = useRef(null);
    const lastValueNumRef = useRef(-Infinity);
    const nextIdRef = useRef(0);

    useEffect(() => {
        if (!showMeasure) return;
        const viewer = getViewer();
        if (!viewer) return;

        let finished = false;
        const MeasureClass = MEASURE_CLASSES[`${type}-${surface}`];
        const instance = new MeasureClass(viewer, {
            locale: {
                start: 'Bắt đầu',
                area: 'Diện tích',
                total: 'Tổng',
                formatLength: (length) => {
                    const text = formatDistanceText(length);
                    // Đường ≥3 điểm: formatLength bị gọi 2 lần cho cùng 1
                    // label cuối — 1 lần với tổng cộng dồn, 1 lần với riêng
                    // đoạn vừa thêm ("+X"). Giữ giá trị LỚN NHẤT từng thấy
                    // trong phiên đo này thay vì "gọi cuối thắng" — tổng
                    // cộng dồn luôn >= bất kỳ đoạn lẻ nào, nên max luôn
                    // đúng là tổng, không phụ thuộc thứ tự 2 lệnh gọi đó.
                    if (length >= lastValueNumRef.current) {
                        lastValueNumRef.current = length;
                        lastValueRef.current = text;
                    }
                    setLiveResult(text); // vẫn hiện realtime mọi giá trị lúc kéo chuột
                    return text;
                },
                formatArea: (area) => {
                    const text = formatAreaText(area);
                    if (area >= lastValueNumRef.current) {
                        lastValueNumRef.current = area;
                        lastValueRef.current = text;
                    }
                    setLiveResult(text);
                    return text;
                },
            },
            drawerOptions: {
                tips: {
                    init: 'Nhấn chuột trái để vẽ',
                    start: 'Chuột trái để vẽ, chuột phải xóa, 2 lần chuột trái để dừng',
                },
            },
            onEnd: (entity) => {
                finished = true;
                const id = nextIdRef.current++;

                // Tính lại tổng TRỰC TIẾP từ toạ độ thật của hình vừa vẽ
                // phải tính lại 2 lần nhưng dễ xử lý hơn trong trường hợp
                // người dùng cứ xóa điểm vẽ lại nhiều lần
                let finalLabel = lastValueRef.current; // fallback nếu đọc entity thất bại
                try {
                    if (type === TYPE_OPTION_DISTANCE) {
                        const positions = entity.polyline?.positions?.getValue(
                            Cesium.JulianDate.now(),
                        );
                        if (positions && positions.length >= 2) {
                            let total = 0;
                            for (let i = 1; i < positions.length; i += 1) {
                                total += instance.getDistance(positions[i - 1], positions[i]);
                            }
                            finalLabel = formatDistanceText(total);
                        }
                    } else {
                        const hierarchy = entity.polygon?.hierarchy?.getValue(
                            Cesium.JulianDate.now(),
                        );
                        if (hierarchy?.positions?.length >= 3) {
                            finalLabel = formatAreaText(
                                instance.getArea(hierarchy.positions, {
                                    maxCells: AREA_SAMPLE_CELL,
                                }),
                            );
                        }
                    }
                } catch (err) {
                    logger.warn(
                        '[MeasureToolbar] Không đọc được toạ độ cuối từ entity, dùng fallback.',
                        err,
                    );
                }

                setMeasurements((prev) => [
                    ...prev,
                    { id, type, surface, label: finalLabel, instance },
                ]);
                setLiveResult(null);
                lastValueRef.current = null;
                lastValueNumRef.current = -Infinity;
                setResetKey((k) => k + 1); // tự sẵn sàng vẽ phép tiếp theo
            },
        });
        instance.start(type === 'distance' ? distanceLineStyle : areaPolygonStyle);

        return () => {
            if (!finished && !instance.destroyed) instance.destroy();

            // Đọc thẳng store thay vì dựa vào `showMeasure` đóng gói trong
            // closure của lần render này — cần biết giá trị MỚI NHẤT tại
            // đúng lúc cleanup chạy, không phải giá trị lúc effect này
            // được tạo ra.

            // GIẢ ĐỊNH VÒNG ĐỜI: MeasureToolbar chỉ bị unmount qua setting showMeasure
            // (đổi mode = reload app). Khi đó store đã là false lúc cleanup chạy nên
            // nhánh dưới huỷ hết phép đo. Nếu sau này component có thể unmount khi
            // showMeasure vẫn bật (render có điều kiện theo mode/panel/route), các
            // instance trong `measurements` sẽ mất tham chiếu -> entity, LabelCollection,
            // MouseTooltip còn lại trên viewer mà không xoá được. Lúc đó cần thêm
            // cleanup lúc unmount hoặc chuyển `measurements` ra store ngoài React.
            const stillOn = useUiSettingsStore.getState().values.showMeasure;
            if (!stillOn) {
                setMeasurements((prev) => {
                    prev.forEach(destroyMeasurement);
                    return [];
                });
            }
        };
    }, [showMeasure, type, surface, resetKey]);

    const selectType = (val) => {
        setType(val);
        setLiveResult(null);
    };
    const selectSurface = (val) => {
        setSurface(val);
        setLiveResult(null);
    };
    const clearAll = () => {
        setMeasurements((prev) => {
            prev.forEach(destroyMeasurement);
            return [];
        });
        setLiveResult(null);
        setResetKey((k) => k + 1); // huỷ luôn phép đang vẽ dở (nếu có)
    };
    const removeOne = (id) => {
        setMeasurements((prev) => {
            const target = prev.find((m) => m.id === id);
            if (target) destroyMeasurement(target);
            return prev.filter((m) => m.id !== id);
        });
    };

    return {
        showMeasure,
        type,
        surface,
        liveResult,
        measurements,
        selectType,
        selectSurface,
        clearAll,
        removeOne,
    };
}
