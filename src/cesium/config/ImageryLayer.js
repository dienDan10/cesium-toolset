import { logger } from '../../utils/logger';

export function setImageryProvider(viewer, imagery_server_url) {
    if (!imagery_server_url) {
        logger.error('setImageryProvider: url null');
        return;
    }

    if (!viewer) {
        logger.error('setImageryProvider: viewer chưa được tạo!');
        return;
    }

    try {
        viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url: imagery_server_url,
                maximumLevel: 20,
            }),
        );
    } catch (e) {
        logger.error('Cannot load image tiles' + e);
    }
}
