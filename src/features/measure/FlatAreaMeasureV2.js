import { AreaMeasure } from '@cesium-extends/measure';

export class FlatAreaMeasureV2 extends AreaMeasure {
    start(style = {}) {
        this.end();
        this._start('POLYGON', { style: { ...style, perPositionHeight: true } });
    }
}
