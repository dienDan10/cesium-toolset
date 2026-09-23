// useUiSettingsStore.js
import { create } from 'zustand';
import { settingsSchema, getDefaultValues } from './SettingsSchema';

export const useUiSettingsStore = create((set, get) => ({
    values: getDefaultValues(),

    // Đọc 1 giá trị theo id (dùng trong các widget wrapper riêng lẻ,
    // ví dụ CompassWidget đọc values.showCompass để gọi show()/hide()).
    get: (id) => get().values[id],

    // Set 1 giá trị theo id — dùng chung cho toggle lẫn choice.
    set: (id, value) =>
        set((state) => ({
            values: { ...state.values, [id]: value },
        })),

    // Nếu sau này schema thêm item mới, các user cũ đã có localStorage
    // cũ sẽ thiếu key -> gọi hàm này để vá thêm default còn thiếu,
    // không ghi đè giá trị người dùng đã chỉnh.
    hydrateMissingDefaults: () =>
        set((state) => ({
            values: { ...getDefaultValues(settingsSchema), ...state.values },
        })),
}));
