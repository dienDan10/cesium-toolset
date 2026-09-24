/** Entity có hiện popup được không (có popup.create, không phải phần phụ). */
export function isPopupEntity(entity) {
    return !!entity && !entity.popupOwnerId && typeof entity.popup?.create === 'function';
}

/** heightReference của graphics chính (billboard / point / model) của entity. */
export function getHeightReference(entity, time) {
    for (const graphics of [entity.billboard, entity.point, entity.model]) {
        const ref = graphics?.heightReference?.getValue(time);
        if (ref !== undefined) return ref;
    }
    return Cesium.HeightReference.NONE;
}
