# Quy ước phối hợp — DeliverTrust

Tài liệu này chốt ranh giới giữa hai thành viên. Mục đích không phải thủ tục,
mà là tránh ba thứ tốn thời gian nhất khi hai người cùng code một repo: làm
trùng việc, sửa đè lên nhau, và dữ liệu bị nhân bản vì mỗi bên tự tạo một
đường đi riêng.

Đọc trước khi bắt đầu GĐ 2 (Giao nhận).

---

## 1. Bản đồ sở hữu

Chia theo bảng 3.3 trong `YeuCau.docx`. Ai sở hữu vùng nào thì người đó là
người quyết định cuối cùng về thiết kế trong vùng đó.

| Vùng | Chủ sở hữu | Nội dung |
|---|---|---|
| `packages/contracts/` | Đàm | Smart contract, script deploy/spike |
| `apps/web/src/lib/blockchain/` | Đàm | Ghi/đọc sự kiện on-chain |
| `apps/mobile/` | Đàm | App tài xế (quét QR, cập nhật trạng thái) |
| `apps/web/src/app/api/deliveries/` | Đàm | Giao nhận, state machine |
| `apps/web/src/app/api/orders/track/` | Đàm | Tracking công khai |
| `apps/web/src/app/api/auth/` | Hien-code | Đăng nhập, đăng ký, tài khoản |
| `apps/web/src/app/api/orders/` (trừ `track/`) | Hien-code | CRUD đơn hàng |
| `apps/web/src/app/api/stats/` | Hien-code | Dashboard, thống kê |
| `packages/database/supabase/migrations/` | **Chung** | Đổi schema phải có cả hai duyệt |
| `packages/shared/src/types/` | **Chung** | Type dùng chung, đổi là ảnh hưởng cả hai |

Nhóm chức năng của Đàm: Người gửi/nhận, Hàng hóa, Giao nhận, Tracking,
Blockchain, COD, Thông báo (36 chức năng).
Nhóm của Hien-code: Tài khoản, Đơn hàng, Dashboard, Admin, Khác
(các dòng đánh dấu "h" trong bảng 3.3).

---

## 2. Năm điểm giao phải chốt

Đây là những chỗ hai phần việc chạm nhau. Bỏ qua thì đến GĐ 2 mới phát hiện,
lúc đó sửa rất đắt.

### 2.1. Tạo đơn ↔ Danh bạ

Màn "Tạo đơn" gọi API `contacts`/`addresses` để lấy `sender_id`,
`receiver_id`, `pickup_address_id`, `delivery_address_id`.

**Không được** tự tạo contact trong luồng tạo đơn.

> Rủi ro nếu bỏ qua: hai bên tự tạo contact riêng, dữ liệu người nhận bị nhân
> bản, sổ địa chỉ mất tác dụng.

### 2.2. Quyền trong token — ✅ ĐÃ XONG

`getAuthFromRequest()` trả về cả `userId` lẫn `roleCode`. Kiểu chuẩn nằm ở
`packages/shared/src/types/auth.ts`:

```ts
export interface AuthTokenPayload {
  userId: string;
  roleCode: RoleCode;   // KHONG phai string tu do
}
```

`roleCode` là `RoleCode`, không phải `string`. Tài khoản chưa được gán vai trò
hợp lệ thì `/api/auth/login` trả 403 chứ không cấp token với vai trò rỗng.
Dùng `isRoleCode()` khi cần kiểm tra ở ranh giới hệ thống.

> Rủi ro nếu bỏ qua: state machine guard theo vai trò (quy tắc 3.1.3.7) sẽ bị
> chuỗi rỗng lọt qua im lặng thay vì báo lỗi.

### 2.3. Ai được đổi trạng thái đơn

`orders.status_id` **chỉ** được ghi qua service giao nhận của Đàm. Không ai
`update` trực tiếp bảng `orders` để đổi trạng thái — kể cả trong luồng tạo đơn
hay hủy đơn.

Mỗi lần đổi trạng thái phải ghi nguyên tử trong một transaction:
`orders.status_id` + `delivery_events` (kèm `from_status_id`) +
`delivery_attempts`.

> Rủi ro nếu bỏ qua: trạng thái nhảy sai luồng, blockchain ghi nhận mốc không
> tồn tại, và lịch sử truy vết bị thủng.

### 2.4. Màn chi tiết đơn

Màn chi tiết đơn (của bạn cùng nhóm) nhúng Timeline hành trình + badge xác
minh blockchain (của Đàm). **Chốt: dùng chung component**, không gọi API rồi
mỗi bên tự render.

> Rủi ro nếu bỏ qua: làm hai lần cùng một giao diện, hoặc màn chi tiết thiếu
> hẳn phần hành trình.

### 2.5. Quét QR

Bảng 3.3 ghi "Quét QR nhận hàng" thuộc nhóm Đàm, nhưng "Camera Web để scan QR"
lại đánh dấu "h". **Chốt: Đàm làm trên app Expo, bạn cùng nhóm làm bản web dự
phòng.**

> Rủi ro nếu bỏ qua: cả hai cùng làm, hoặc cả hai cùng bỏ.

---

## 3. Quy trình Git

- `main` là nhánh tích hợp. **Không commit thẳng vào `main`.**
- Mỗi người làm trên nhánh riêng, đặt tên theo giai đoạn:
  `dam/gd2-state-machine`, `<ten>/don-hang-crud`.
- Gộp vào `main` bằng Pull Request. CI phải xanh mới merge.
- File `.github/CODEOWNERS` tự gán người review theo vùng sở hữu. Đụng vào
  `migrations/` hoặc `packages/shared/src/types/` thì **cần cả hai duyệt**.
- Rebase nhánh của mình lên `main` trước khi mở PR, để lịch sử thẳng và dễ
  trình bày trong báo cáo.

## 4. Đổi schema

Schema là vùng dễ va chạm nhất vì cả hai cùng đọc ghi.

1. Không sửa file migration cũ đã chạy. Luôn tạo file mới:
   `<timestamp>_<mo_ta_ngan>.sql`.
2. Báo cho người kia **trước khi** push migration.
3. Sau khi apply, chạy lại `pnpm db:gen-types` và commit
   `packages/database/src/database.types.ts` cùng migration trong một PR.
4. Sửa enum tương ứng trong `packages/shared/src/enums.ts` nếu có thêm mã mới.
