// Chế độ hiển thị popup
export const POPUP_MODE_HOVER = 'hover'; // ẩn hết, chỉ hiện popup của entity đang hover
export const POPUP_MODE_ALL = 'all'; // hiện popup của mọi entity, không cần hover

// Thời gian chờ (ms) từ lúc chuột rời entity đến lúc popup ẩn.
// Nếu chuột quay lại đúng entity đó trong khoảng này thì popup giữ nguyên
// (chống nhấp nháy khi chuột lướt qua mép entity).
// Đặt 0 = chuột ra là ẩn ngay, không chờ.
export const POPUP_HOVER_HIDE_DELAY_MS = 1000;

// Chu kỳ (ms) gọi entity.popup.update() cho popup đang hiện.
// 250 ms = 4 lần/giây — đủ mượt cho số liệu realtime (tốc độ, độ cao...)
// mà không re-render nội dung mỗi frame.
export const POPUP_UPDATE_INTERVAL_MS = 250;

// Độ lệch (px) của popup so với điểm neo trên màn hình.
// Popup được neo ở giữa-dưới: tâm cạnh dưới popup nằm tại vị trí entity,
// cộng thêm offset này. y âm = đẩy popup lên trên.
export const POPUP_OFFSET_X_PX = 0;
export const POPUP_OFFSET_Y_PX = -12;

// Khoảng cách tối đa (m) từ camera tới entity để popup còn hiện.
// Infinity = không giới hạn. Hữu ích ở chế độ "hiện hết" khi zoom xa,
// tránh hàng trăm popup chồng lên nhau.
export const POPUP_MAX_DISTANCE_M = Infinity;
