import { useCallback, useEffect } from 'react';
import './App.css';
import { createViewer } from './cesium/init/viewer';
import { setImageryProvider } from './cesium/config/ImageryLayer';
import { setTerrainProvider } from './cesium/config/TerrainLayer';
import SettingsPanel from './features/settings/SettingsPanel';
import MeasureToolbar from './features/measure/MeasureToolbar';

function App() {
    const initCesiumViewer = useCallback(() => {
        const viewer = createViewer('cesiumContainer', {
            baseLayerPicker: false,
            geocoder: false,
            infoBox: false,
            selectionIndicator: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
        });
        // viewer.extend(Cesium.viewerPerformanceWatchdogMixin);
        // viewer.extend(Cesium.viewerCesiumInspectorMixin);
        // viewer.cesiumInspector.viewModel.performance = true;
        viewer.imageryLayers.removeAll();
        setImageryProvider(viewer, 'http://10.217.161.224:8889/contour/{z}/{x}/{y}.png');
        setTerrainProvider(viewer, 'http://10.217.161.224:6868/terrain');
    }, []);

    useEffect(() => {
        initCesiumViewer();
    }, [initCesiumViewer]);

    return (
        <div className="relative overflow-hidden w-dvw h-dvh">
            <div id="cesiumContainer" className="absolute top-0 left-0 w-full h-full"></div>
            <SettingsPanel />
            <MeasureToolbar />
        </div>
    );
}

export default App;
