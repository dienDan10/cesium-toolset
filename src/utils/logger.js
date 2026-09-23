export const logger = {
    log: (...args) => {
        console.log('[DEBUG]', ...args);
    },
    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },
    error: (...args) => {
        // Luôn log lỗi, dù là dev hay prod
        console.error('[ERROR]', ...args);
    },
};

function initErrorCapture(viewer) {
    viewer.scene.renderError.addEventListener((scene, error) => {
        logger.error('renderError', error);
    });

    window.addEventListener('error', (event) => {
        logger.error('onerror', event.error ?? event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
        logger.error('unhandledrejection', event.reason);
    });
}

export { initErrorCapture };
