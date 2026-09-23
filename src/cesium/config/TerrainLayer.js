import { logger } from '../../utils/logger';

export async function setTerrainProvider(viewer, terrain_server_url) {
    if (!terrain_server_url) {
        logger.error('setImageryProvider: url null');
        return;
    }

    if (!viewer) {
        logger.error('setImageryProvider: viewer chưa được tạo!');
        return;
    }
    try {
        viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(terrain_server_url);

        // tăng nhẹ cao độ
        // _viewer.scene.verticalExaggeration = 1.5;
    } catch (e) {
        logger.error(`Cannot load terrain tiles: ${e}`);
    }
}
