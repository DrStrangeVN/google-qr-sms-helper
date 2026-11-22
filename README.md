# Google QR → SMS (Bản Tiếng Việt v2.2.0)

Extension Chrome (Manifest V3) chuyển luồng xác minh QR bắt buộc của Google (`MO-SMS / GMS Constellation`) về giao diện **nhập số điện thoại nhận mã SMS 6 số**, giao diện hoàn toàn bằng Tiếng Việt.

## Nâng cấp nổi bật (v2.2.0)
- **Giao diện Tiếng Việt 100% (Shadow DOM + kéo thả)**: không bị CSS của Google làm vỡ bố cục, có nút thu gọn, kéo di chuyển tự do và Popup trên thanh công cụ Chrome.
- **RPC đồng nguồn + Background fallback**: thực hiện `fetch()` ngay trong ngữ cảnh `accounts.google.com` để dùng cookie chính chủ (tránh lỗi `TypeError: Failed to fetch` khi dùng proxy/AdBlock), tự động fallback về Service Worker nếu bị CSP chặn.
- **Giả lập iPad Mini thông minh theo phiên (tự tắt sau 30 phút)**: chỉ áp dụng cho 4 đường dẫn xác minh (`uplevelingstep/*`, `_/IdvUplevelingUi/*`, `challenge/iap*idv_xdevice=1`, `devicephoneverification/*`) và chỉ spoof `navigator` khi URL có `idv_xdevice=1` — tránh lỗi chọn SMS xong bị Google đá ngược về QR hoặc làm hỏng Passkey.
- **Đọc đa nguồn `tl` + `at` + `dsh`**: hỗ trợ quét ảnh QR (`<img>`, `<canvas>`, `<svg>`), tự tách link `devicephoneverification/begin|initiate` nhúng trong HTML, giải mã `g.co/verify/...` qua `fetch` hoặc tab ẩn, hỗ trợ dán link thủ công.
- **Tự nhận diện trang chọn SĐT sẵn (`choice`)**: nếu Google hiện sẵn tùy chọn xác minh số điện thoại, có nút chọn nhanh 1 chạm không cần chạy RPC.
- **Chẩn đoán & Tự kiểm tra (`Tự kiểm tra` / `Sao chép log`)**: kiểm tra kết nối tới `g.co` & `accounts.google.com`, phát hiện bị đẩy ngược về QR (`lastAttempt`), xuất log đã tự động che token bảo mật.

## Cài đặt vào Chrome / Edge / Brave
1. Tải về hoặc clone repo này:
   ```bash
   git clone https://github.com/DrStrangeVN/google-qr-sms-helper.git
   ```
2. Mở `chrome://extensions/` trên trình duyệt.
3. Bật **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
4. Bấm **Load unpacked (Tải tiện ích đã giải nén)** và chọn thư mục `google-qr-sms-helper`.

## Hướng dẫn sử dụng
> **Lưu ý quan trọng:** Không chạy trực tiếp từ trang QR của ứng dụng bên thứ ba (Antigravity, Gemini CLI...). Hãy đi qua **Google Cloud Console** trước để mở khóa xác minh cho tài khoản Google.

1. Mở `https://console.cloud.google.com/` bằng tài khoản Google cần xác minh.
2. Bấm **`① Tự động mở Cloud Shell & Verify`** trên bảng nổi (hoặc bấm icon `[>_]` ở góc trên phải → bấm **Verify / Xác minh**).
3. Khi trang QR hiện ra, bấm **`⚡ Hạ cấp sang xác minh SMS`** (hoặc bật *Tự động hạ cấp khi mở trang QR*).
4. Chọn **Text message (SMS)**, nhập số điện thoại và mã 6 số `G-xxxxxx`.
5. Xác minh xong, bấm **`Khôi phục máy tính`** (hoặc mở popup extension trên thanh công cụ để tắt giả lập; extension cũng tự tắt sau 30 phút).

## Ghi công (Credits)
Phát triển và Việt hóa dựa trên kiến trúc kỹ thuật từ [havenicec/google-qr-sms-helper](https://github.com/havenicec/google-qr-sms-helper) và các bản vá tương thích từ [CyanQX/google-qr-downgrade](https://github.com/CyanQX/google-qr-downgrade). Phát hành theo giấy phép MIT.
