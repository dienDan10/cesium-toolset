// settingsSchema.js
//
// Nguồn sự thật duy nhất cho nội dung settings panel.
// Muốn thêm 1 toggle/tùy chọn mới -> chỉ thêm 1 item vào category tương ứng
// (hoặc thêm category mới). KHÔNG cần sửa SettingsPanel.jsx.
//
// item.type:
//   "toggle" -> checkbox bật/tắt, value: boolean
//   "choice" -> chọn 1 trong nhiều, value: string (khớp với choices[].value)
//
// item.icon: key ngắn (vd "map", "compass") — được map sang icon component
// thật (Tabler) trong SettingsPanel.jsx qua object ICONS. Thêm icon mới ->
// thêm 1 dòng vào ICONS bên đó, không cần sửa gì ở đây.

export const settingsSchema = [
    {
        id: 'display',
        label: 'Hiển thị',
        items: [
            // Ví dụ item thật sẽ thêm sau, để tạm 1 item mẫu cho dễ test UI:
            {
                id: 'showMinimap',
                label: 'Minimap',
                icon: 'map',
                type: 'toggle',
                default: true,
            },
        ],
    },
    {
        id: 'tools',
        label: 'Công cụ',
        items: [
            {
                id: 'showMeasure',
                label: 'Đo lường',
                icon: 'ruler',
                type: 'toggle',
                default: false,
            },
        ],
    },
];

// Tính sẵn object giá trị mặc định từ schema, dùng để khởi tạo store.
export function getDefaultValues(schema = settingsSchema) {
    return Object.fromEntries(
        schema.flatMap((category) => category.items.map((item) => [item.id, item.default])),
    );
}
