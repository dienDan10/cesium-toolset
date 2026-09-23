import { logger } from '../../utils/logger';

let _viewer = null;

export function createViewer(containerId, cesiumOptions = {}) {
    if (_viewer) {
        logger.warn('Viewer đã được tạo rồi');
        return _viewer;
    }

    _viewer = new Cesium.Viewer(containerId, cesiumOptions);
    return _viewer;
}

export function getViewer() {
    if (!_viewer) {
        logger.error('Viewer chưa được tạo — gọi createViewer() trước');
        return;
    }
    return _viewer;
}
