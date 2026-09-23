import { DistanceMeasure } from '@cesium-extends/measure';
import { cartesian3FromCartographic, makeHeightSampler } from './MeasureUtils';

/**
 * Khoảng cách bám đất — chia đều N điểm dọc geodesic thật giữa start/end
 * (không phải pixel màn hình), lấy độ cao thật từng điểm, cộng dồn khoảng
 * cách 3D giữa các điểm liên tiếp.
 */
export class DistanceSurfaceMeasureV2 extends DistanceMeasure {
    constructor(viewer, options = {}) {
        super(viewer, options);
        this._splitNumV2 = options.splitNum ?? 100;
        this._sampleHeight = makeHeightSampler(viewer);
    }

    getDistance(start, end) {
        const startCarto = Cesium.Cartographic.fromCartesian(start);
        const endCarto = Cesium.Cartographic.fromCartesian(end);
        const geodesic = new Cesium.EllipsoidGeodesic(startCarto, endCarto);

        const n = this._splitNumV2;
        const points = [];
        for (let i = 0; i <= n; i += 1) {
            const fraction = i / n;
            const carto = geodesic.interpolateUsingFraction(fraction);
            const height = this._sampleHeight(carto);
            points.push(cartesian3FromCartographic(carto, height));
        }

        let total = 0;
        for (let i = 1; i < points.length; i += 1) {
            total += Cesium.Cartesian3.distance(points[i - 1], points[i]);
        }
        return total;
    }

    start(style = {}) {
        this._start('POLYLINE', { style, clampToGround: true });
    }
}
