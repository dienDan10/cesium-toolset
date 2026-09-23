/** Entity có hiện popup được không (có popup.create, không phải phần phụ). */
export function isPopupEntity(entity) {
    return !!entity && !entity.popupOwnerId && typeof entity.popup?.create === 'function';
}
