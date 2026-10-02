# Tạo đơn và tra mã cho khách vãng lai

Luồng: khách nhập thông tin gửi/nhận và hàng hóa → yêu cầu OTP qua email người gửi → nhập OTP → API xác thực email → tạo đơn, gán kho và lập tuyến. Để tra lại mã vận đơn, nhập **đúng email người gửi** rồi xác thực OTP mới. Có thể nhập thêm số điện thoại người gửi để lọc các đơn; không cấp danh sách mã chỉ theo số điện thoại.

Kết quả tra cứu hiển thị 20 đơn mỗi trang. Sau lần xác thực OTP đầu, trình duyệt giữ một vé tra cứu ngắn hạn trong bộ nhớ để chuyển trang mà không phải nhập lại OTP; vé hết hạn sau 10 phút và không được lưu vào localStorage.

Trang `/register` cũng dùng cùng Supabase Auth email OTP: yêu cầu mã tại `/api/auth/register/otp`, sau đó gửi OTP cùng thông tin đăng ký tới `/api/auth/register`. Server chỉ tạo user `CUSTOMER` trong bảng `users` sau khi OTP của đúng email được xác minh và xác nhận. Endpoint đăng ký không chấp nhận cờ xác minh từ client. Đăng nhập DeliverTrust vẫn dùng bảng `users`, bcrypt và JWT hiện có; xác minh OTP không tự tạo tài khoản ứng dụng. Do helper OTP hiện đặt `shouldCreateUser: true`, Supabase Auth có thể đồng thời tạo identity Auth riêng cho email chưa có trong Auth. Nếu tạo bản ghi ứng dụng lỗi sau khi OTP đã được dùng, người dùng cần yêu cầu mã mới rồi thử lại; thông tin mật khẩu không được lưu tạm.

## Cấu hình trước khi thử thực tế

1. Ba migration `20261001090000_public_tracking_rate_limit.sql`, `20261001100000_guest_email_orders.sql` và `20261001110000_delivery_feedback_and_notification_privacy.sql` đã được áp dụng lên Supabase ngày 01/10/2026 sau khi người dùng xác nhận hai người phụ trách đã duyệt. Với môi trường khác, áp dụng đủ ba migration theo thứ tự; không sửa migration đã chạy.
2. Cấu hình **Custom SMTP** trong Supabase Auth để gửi tới địa chỉ email bất kỳ. Chủ dự án xác nhận ngày 01/10/2026 rằng mục này **chưa cấu hình**, nên chưa thể kiểm thử OTP/tạo đơn vãng lai bằng email thật. Mailer mặc định của Supabase không phù hợp cho khách bên ngoài.
3. Trong Supabase Auth → Email Templates → Magic Link, thay liên kết xác nhận bằng mã `{{ .Token }}` trong nội dung email. API xác minh bằng `verifyOtp` loại `email`, không dùng magic link.
4. Kiểm tra `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` và `JWT_SECRET` ở môi trường web. Không đưa service-role key vào client hoặc commit file `.env`.
5. Mở `/gui-hang` để tạo một đơn thử, nhập **email người nhận** và lưu mã vận đơn; mở `/tra-lai-ma` và dùng email người gửi để tra lại, thử cả khi có và không có số điện thoại lọc. Kiểm tra kho, tuyến và trạng thái bằng tài khoản điều phối viên.
6. Sau khi shipper xác nhận giao thành công kèm ảnh minh chứng, đơn được đặt trạng thái `DELIVERED` ngay, không chờ người nhận xác nhận. Trên `/tra-cuu/<mã vận đơn>`, người nhận nhập email đã lưu trên đơn, nhận OTP và gửi đánh giá hoặc phản ánh. Phản ánh được lưu vào `order_feedback`, tạo `alerts` và thông báo cho điều phối viên của kho liên quan. Nhấn thông báo để đọc nội dung phản ánh; mỗi đơn nhận tối đa một đánh giá và một phản ánh. Luồng đánh dấu đã giải quyết có thể thực hiện sau.

Tham khảo tài liệu Supabase: [Email OTP](https://supabase.com/docs/guides/auth/auth-email-templates), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Email OTP được dùng như bằng chứng kiểm soát email ở thời điểm tạo/tra mã và phản hồi. Nó **không xác thực số điện thoại**. Thông báo trong ứng dụng cho đơn có tài khoản chỉ gửi người tạo đơn, không ghép tài khoản người nhận theo số điện thoại; đơn vãng lai không gửi thông báo trong ứng dụng tới tài khoản hệ thống chung. Email người nhận được chụp cố định khi tạo đơn để tránh sửa sổ địa chỉ rồi mạo danh. Đơn cũ chưa lưu email người nhận tại thời điểm tạo không hỗ trợ phản hồi qua OTP. Migration mới ngăn thông báo gửi sai trong tương lai, không tự xóa các thông báo đã tồn tại; cần kiểm tra riêng nếu có đơn vãng lai được tạo trước ngày áp dụng.
