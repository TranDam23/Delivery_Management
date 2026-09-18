# Kịch bản test giao hàng: 3 đơn từ Hà Nội

Ba đơn cùng xuất phát từ **Phường Cầu Giấy, Hà Nội**, mỗi đơn kiểm tra một nhánh khác nhau của quy trình:

| Đơn | Nơi nhận | Nhánh kiểm tra | Trạng thái cuối |
|---|---|---|---|
| 1 | Phường Hải Châu, Đà Nẵng | Giao thành công, có thu COD, người nhận xác nhận | Giao thành công |
| 2 | Phường Nha Trang, Khánh Hòa | Lấy hàng thất bại một lần, kiện hư hỏng khi nhập kho, giao thất bại một lần rồi giao lại thành công | Giao thành công |
| 3 | Phường Bến Thành, TP.HCM | Giao thất bại 3 lần, tự lập tuyến hoàn, hoàn hàng về người gửi | Đã hoàn hàng |

Cả ba đơn đều là tuyến **liên vùng**, gồm 7 chặng (đã chạy thử lập tuyến trên hệ thống ngày 18/09/2026):

```
Chặng 1  Lấy hàng        Người gửi                  → Kho Cầu Giấy (VN-01-00166)
Chặng 2  Chuyển kho      Kho Cầu Giấy               → Kho tỉnh Hà Nội (VN-PARENT-fb231348)
Chặng 3  Chuyển kho      Kho tỉnh Hà Nội            → Trung tâm vùng Bắc Bộ (VN-REG-NORTH)
Chặng 4  Chuyển kho      Trung tâm vùng Bắc Bộ      → Trung tâm vùng đích (*)
Chặng 5  Chuyển kho      Trung tâm vùng đích        → Kho tỉnh đích
Chặng 6  Chuyển kho      Kho tỉnh đích              → Kho phường đích
Chặng 7  Giao cuối       Kho phường đích            → Người nhận
```

(*) Đà Nẵng và Nha Trang đi qua **VN-REG-CENTRAL** (miền Trung, đặt tại Đà Nẵng); TP.HCM đi qua **VN-REG-SOUTHEAST** (Đông Nam Bộ).

| | Kho tỉnh đích | Kho phường đích |
|---|---|---|
| Đơn 1 | VN-PARENT-324b7df4 (Đà Nẵng) | VN-48-20242 (Hải Châu) |
| Đơn 2 | VN-PARENT-66c06ab7 (Khánh Hòa) | VN-56-22366 (Nha Trang) |
| Đơn 3 | VN-PARENT-1ff7b4df (TP.HCM) | VN-79-26743 (Bến Thành) |

---

## 0. Chuẩn bị

0. Điền 3 key Cloudinary vào `apps/web/.env` (xem `.env.example`). Chưa có key thì bước giao thành công không chụp ảnh lưu được.
1. Mở **Supabase Dashboard → SQL Editor**, dán toàn bộ file `packages/database/supabase/test_accounts_hanoi_routes.sql` rồi bấm **Run**. Bảng kết quả phải có 23 tài khoản, và mọi tài khoản nhân viên đều có `warehouse_code`.
2. Chạy web: `pnpm --filter @delivery/web dev`, mở `http://localhost:3000`.
3. Nên mở mỗi vai trò trong một cửa sổ ẩn danh hoặc một profile trình duyệt riêng để khỏi phải đăng xuất liên tục.
4. Ghi chép blockchain đang **tắt** (`BLOCKCHAIN_WRITE_ENABLED` không bật), nên kịch bản này không kiểm tra blockchain.

**Tài khoản** (mật khẩu chung `123456`, email đều có đuôi `@test.delivertrust.com`):

| Vai trò | Email (phần trước @) | Dùng cho |
|---|---|---|
| Khách gửi | `kh.gui.hanoi` | Tạo cả 3 đơn |
| Khách nhận | `kh.nhan.danang` / `kh.nhan.nhatrang` / `kh.nhan.hcm` | Xem đơn nhận, xác nhận đã nhận |
| Điều phối | `dp.hanoi` | Phân công shipper lấy hàng; giao hoàn ở đơn 3 |
| Điều phối | `dp.danang` / `dp.khanhhoa` / `dp.hcm` | Phân công shipper giao cuối |
| Shipper | `sp.hn.caugiay` | Lấy hàng cả 3 đơn; giao hoàn đơn 3 |
| Shipper | `sp.dn.haichau` / `sp.kh.nhatrang` / `sp.hcm.benthanh` | Giao cuối |
| Nhân viên kho | `kho.hn.caugiay`, `kho.hn.tinh`, `kho.vung.bac` | Các kho phía Hà Nội |
| Nhân viên kho | `kho.vung.trung`, `kho.dn.tinh`, `kho.dn.haichau` | Tuyến Đà Nẵng |
| Nhân viên kho | `kho.vung.trung`, `kho.kh.tinh`, `kho.kh.nhatrang` | Tuyến Nha Trang |
| Nhân viên kho | `kho.vung.dnb`, `kho.hcm.tinh`, `kho.hcm.benthanh` | Tuyến TP.HCM |

**Màn hình theo vai trò**

| Vai trò | Trang | Thao tác |
|---|---|---|
| Khách hàng | `/contacts`, `/orders/new`, `/orders/sent`, `/orders/received`, `/orders/[id]` | Danh bạ, tạo đơn, xem đơn, xác nhận nhận hàng |
| Điều phối | `/dashboard/dispatcher/warehouses` | Mục "Chặng đang xử lý": chọn shipper cho chặng |
| Shipper (mở trên điện thoại) | `/dashboard/delivery/routes` | Tab Cần làm / Chờ kho / Đã xong; Đã lấy hàng / Không lấy được / Nhận hàng & bắt đầu giao / Giao thành công (chụp ảnh) / Thất bại |
| Nhân viên kho | `/dashboard/warehouse` (tổng quan), `/dashboard/warehouse/operations` (thao tác) | Tab Chờ nhập kho / Chờ xuất kho / Tất cả chặng; bấm vào đơn để kiểm hàng & nhập kho, xuất kho, nhận lại hàng giao thất bại |
| Mọi người | `/orders/track/[mã vận đơn]` | Xem hành trình |

---

## 1. Tạo danh bạ và 3 đơn (khách `kh.gui.hanoi`)

**1.1. Tạo liên hệ người gửi** (`/contacts/new`): tên *KH Gửi Hà Nội*, SĐT `0911000001`, loại **Người gửi**. Thêm địa chỉ:
- Số nhà: `144 Xuân Thủy`
- Tỉnh/Thành phố: `Thành phố Hà Nội`
- Phường/Xã: `Phường Cầu Giấy`

**1.2. Tạo 3 liên hệ người nhận** (loại **Người nhận**). SĐT phải **trùng với tài khoản khách nhận** để người nhận thấy đơn và xác nhận được:

| Liên hệ | SĐT | Địa chỉ | Phường/Xã | Tỉnh/Thành phố |
|---|---|---|---|---|
| Nhận Đà Nẵng | `0911000002` | 12 Bạch Đằng | Phường Hải Châu | Thành phố Đà Nẵng |
| Nhận Nha Trang | `0911000003` | 20 Trần Phú | Phường Nha Trang | Tỉnh Khánh Hòa |
| Nhận TP.HCM | `0911000004` | 45 Lê Lợi | Phường Bến Thành | Thành phố Hồ Chí Minh |

**1.3. Tạo 3 đơn** (`/orders/new`), đều gửi từ địa chỉ Cầu Giấy:

| Đơn | Người nhận | Hàng hóa | COD |
|---|---|---|---|
| 1 | Nhận Đà Nẵng | Sách, 1 kg | **350.000** |
| 2 | Nhận Nha Trang | Gốm sứ dễ vỡ, 2 kg | 0 |
| 3 | Nhận TP.HCM | Quần áo, 1 kg | 200.000 |

**Kết quả mong đợi (mỗi đơn):**
- Tạo đơn thành công, có mã vận đơn `DH...` và QR. Ghi lại 3 mã này để dùng ở các bước sau.
- Trạng thái đơn: **Chờ phân công**.
- Trang `/dashboard/dispatcher/warehouses` của `dp.hanoi` hiện đơn với **chặng 1–4**. Điều phối viên chỉ thấy các chặng chạm tới kho trong tỉnh mình; chặng 4 hiện vì trung tâm vùng Bắc Bộ đặt tại Hà Nội. Muốn xem đủ 7 chặng thì dùng tài khoản Admin.

---

## 2. Chặng phía Hà Nội (chung cho 3 đơn, riêng đơn 2 có thêm bước lỗi)

| # | Người làm | Thao tác | Trạng thái đơn sau bước | Chặng |
|---|---|---|---|---|
| 2.1 | `dp.hanoi` | Chặng 1 (Lấy hàng): chọn **Shipper Cầu Giấy** | Đã phân công | C1: Đã phân công |
| 2.2 | `sp.hn.caugiay` | Bấm **Đã lấy hàng** | Đã lấy hàng | C1: Đang thực hiện |
| 2.3 | `kho.hn.caugiay` | Chặng 1: nhập tình trạng **Nguyên vẹn**, cân nặng thực tế (ví dụ `1.1`), bấm **Kiểm hàng & nhập kho** | Tại kho | C1: Đã hoàn tất |
| 2.4 | `kho.hn.caugiay` | Chặng 2: **Xuất kho** | Đang vận chuyển | C2: Đang thực hiện |
| 2.5 | `kho.hn.tinh` | Chặng 2: **Kiểm hàng & nhập kho** (Nguyên vẹn) | Tại kho | C2: Đã hoàn tất |
| 2.6 | `kho.hn.tinh` | Chặng 3: **Xuất kho** | Đang vận chuyển | C3: Đang thực hiện |
| 2.7 | `kho.vung.bac` | Chặng 3: **Kiểm hàng & nhập kho** | Tại kho | C3: Đã hoàn tất |
| 2.8 | `kho.vung.bac` | Chặng 4: **Xuất kho** | Đang vận chuyển | C4: Đang thực hiện |

**Đơn 2 làm thêm trước bước 2.2 (lấy hàng thất bại):**
- 2.1a `sp.hn.caugiay`: nhập lý do *"Người gửi chưa đóng gói xong"*, bấm **Lấy hàng thất bại**. Đơn quay về **Chờ phân công**; chặng 1 **Thất bại**; trang điều phối ghi "Lấy hàng thất bại · cần phân công lại".
- 2.1b `dp.hanoi`: phân công lại chặng 1 cho Shipper Cầu Giấy. Trang shipper hiện "Lần 2". Sau đó làm tiếp từ bước 2.2.

---

## 3. Đơn 1: Hà Nội → Đà Nẵng (giao thành công, COD, người nhận xác nhận)

| # | Người làm | Thao tác | Trạng thái đơn sau bước |
|---|---|---|---|
| 3.1 | `kho.vung.trung` | Chặng 4: **Kiểm hàng & nhập kho** | Tại kho |
| 3.2 | `kho.vung.trung` | Chặng 5: **Xuất kho** | Đang vận chuyển |
| 3.3 | `kho.dn.tinh` | Chặng 5: nhập kho, sau đó chặng 6: xuất kho | Tại kho → Đang vận chuyển |
| 3.4 | `kho.dn.haichau` | Chặng 6: **Kiểm hàng & nhập kho** | Tại kho |
| 3.5 | `dp.danang` | Chặng 7: chọn **Shipper Hải Châu** | Tại kho (chặng 7: Đã phân công) |
| 3.6 | `kho.dn.haichau` | Chặng 7: **Xuất kho giao shipper** | Tại kho (chặng 7: Đang thực hiện) |
| 3.7 | `sp.dn.haichau` | Bấm **Đã nhận hàng tại kho / Bắt đầu giao** (trình duyệt hỏi quyền vị trí: cho phép hoặc từ chối đều được) | Đang giao hàng |
| 3.8 | `sp.dn.haichau` | Bấm **Giao thành công** → **Chụp ảnh** (đợi hiện "Đã lưu ảnh") → tick **Đã thu đủ 350.000 đ** → **Xác nhận** | Giao thành công |
| 3.9 | `kh.nhan.danang` | `/orders/received` → mở đơn → **Xác nhận đã nhận hàng** | Giao thành công, hiện "Người nhận đã xác nhận lúc ..." |

**Kiểm tra thêm ở đơn 1:**
- Ở bước 3.5, nếu `dp.danang` phân công chặng 7 **trước** bước 3.4 thì phải báo lỗi *"Hàng chưa đến kho phát, chưa thể phân công chặng giao cuối"*.
- Ở bước 3.8: chưa chụp ảnh hoặc chưa tick COD thì nút Xác nhận báo lỗi ngay trong bảng.
- Trang `/orders/<id đơn 1>` của khách hiện ảnh minh chứng ở mốc "Giao thành công"; ảnh nằm trên Cloudinary, thư mục `delivertrust/delivery-proofs/<năm-tháng>`.
- Trước bước 3.8, `kh.nhan.danang` không thấy nút xác nhận.
- Supabase, bảng `cod_transactions`: có đúng 1 dòng của đơn, `amount = 350000`, `status = collected`.
- `/orders/track/<mã đơn 1>` hiện đủ các mốc giao nhận và mốc nhập/xuất ở 6 kho (Cầu Giấy, kho tỉnh Hà Nội, vùng Bắc Bộ, vùng miền Trung, kho tỉnh Đà Nẵng, Hải Châu).

---

## 4. Đơn 2: Hà Nội → Nha Trang (kiện hư hỏng, giao lại)

| # | Người làm | Thao tác | Trạng thái đơn sau bước |
|---|---|---|---|
| 4.1 | `kho.vung.trung` | Chặng 4: chọn tình trạng **Hư hỏng / móp / ướt**, thử bấm nhập kho khi **chưa** mô tả → bị chặn. Nhập mô tả *"Móp góc hộp, lớp xốp còn nguyên"* rồi bấm lại | Tại kho |
| 4.2 | `kho.vung.trung` | Chặng 5: **Xuất kho** | Đang vận chuyển |
| 4.3 | `kho.kh.tinh` | Chặng 5: nhập kho, sau đó chặng 6: xuất kho | Tại kho → Đang vận chuyển |
| 4.4 | `kho.kh.nhatrang` | Chặng 6: nhập kho | Tại kho |
| 4.5 | `dp.khanhhoa` | Chặng 7: chọn **Shipper Nha Trang** | Tại kho |
| 4.6 | `kho.kh.nhatrang` | Chặng 7: **Xuất kho giao shipper** | Tại kho |
| 4.7 | `sp.kh.nhatrang` | **Bắt đầu giao** | Đang giao hàng |
| 4.8 | `sp.kh.nhatrang` | Nhập lý do *"Người nhận hẹn giao lại ngày mai"*, bấm **Giao thất bại** | **Giao lại** |
| 4.9 | `dp.khanhhoa` | Thử phân công lại chặng 7 → phải bị chặn: *"Kho phát chưa xác nhận nhận lại hàng..."* | Giao lại |
| 4.10 | `kho.kh.nhatrang` | Chặng 7: **Nhận lại hàng giao thất bại** (Nguyên vẹn) | Giao lại |
| 4.11 | `dp.khanhhoa` | Phân công lại chặng 7 cho Shipper Nha Trang (trang shipper hiện "Lần 2") | Giao lại |
| 4.12 | `kho.kh.nhatrang` | **Xuất kho giao shipper** (nút hiện lại cho lần 2) | Giao lại |
| 4.13 | `sp.kh.nhatrang` | **Nhận hàng & bắt đầu giao**, rồi **Giao thành công** → chụp ảnh → **Xác nhận** (đơn không có COD nên không có ô tick) | Giao thành công |
| 4.14 | `kh.nhan.nhatrang` | Xác nhận đã nhận hàng | Giao thành công |

**Kiểm tra thêm ở đơn 2:**
- Supabase, bảng `alerts`: có 1 dòng `alert_type = PACKAGE_DAMAGED` cho đơn này, nội dung chứa mô tả hư hỏng.
- Bảng `delivery_attempts` của chặng 7: 2 dòng (lần 1 `failed`, lần 2 `success`).
- Bảng `warehouse_events` tại kho Nha Trang cho chặng 7: OUTBOUND lần 1, INBOUND lần 1 (nhận lại), OUTBOUND lần 2.

---

## 5. Đơn 3: Hà Nội → TP.HCM (giao thất bại 3 lần → hoàn hàng)

**5.1. Đưa hàng tới kho Bến Thành:**

| # | Người làm | Thao tác |
|---|---|---|
| 5.1.1 | `kho.vung.dnb` | Chặng 4: nhập kho; chặng 5: xuất kho |
| 5.1.2 | `kho.hcm.tinh` | Chặng 5: nhập kho; chặng 6: xuất kho |
| 5.1.3 | `kho.hcm.benthanh` | Chặng 6: nhập kho |

**5.2. Lặp 3 lần giao** (lần 1, 2, 3):

| # | Người làm | Thao tác |
|---|---|---|
| a | `dp.hcm` | Phân công chặng 7 cho **Shipper Bến Thành** |
| b | `kho.hcm.benthanh` | **Xuất kho giao shipper** |
| c | `sp.hcm.benthanh` | **Bắt đầu giao** → nhập lý do *"Không liên lạc được người nhận"* → **Giao thất bại** |
| d | `kho.hcm.benthanh` | **Nhận lại hàng giao thất bại** |

Trạng thái đơn sau bước c: lần 1 và lần 2 là **Giao lại**; lần 3 là **Giao thất bại**. Sau lần 3, `dp.hcm` phân công lại sẽ bị chặn: *"Đơn hàng đã đạt số lần giao tối đa..."*.

Ở bước d của **lần 3**, kho Bến Thành nhận thông báo *"Đơn đã hết số lần giao, hệ thống đã lập tuyến hoàn về người gửi."* Đơn chuyển sang **Đang hoàn hàng**.

**5.3. Tuyến hoàn** (hệ thống tự thêm chặng 8 đến 13; trang điều phối ghi "(hoàn hàng)"):

| Chặng | Tuyến | Người làm |
|---|---|---|
| 8 | Kho Bến Thành → Kho tỉnh TP.HCM | `kho.hcm.benthanh` xuất, `kho.hcm.tinh` nhập |
| 9 | Kho tỉnh TP.HCM → Trung tâm vùng Đông Nam Bộ | `kho.hcm.tinh` xuất, `kho.vung.dnb` nhập |
| 10 | Trung tâm vùng Đông Nam Bộ → Trung tâm vùng Bắc Bộ | `kho.vung.dnb` xuất, `kho.vung.bac` nhập |
| 11 | Trung tâm vùng Bắc Bộ → Kho tỉnh Hà Nội | `kho.vung.bac` xuất, `kho.hn.tinh` nhập |
| 12 | Kho tỉnh Hà Nội → Kho Cầu Giấy | `kho.hn.tinh` xuất, `kho.hn.caugiay` nhập |
| 13 | Giao hoàn cho người gửi (144 Xuân Thủy) | `dp.hanoi` phân công **Shipper Cầu Giấy** → `kho.hn.caugiay` xuất kho → shipper **Nhận hàng & bắt đầu giao hoàn** → **Đã hoàn hàng** → chụp ảnh → **Xác nhận** |

**Kết quả mong đợi:**
- Suốt chặng 8–13, đơn giữ trạng thái **Đang hoàn hàng** (không nhảy về "Tại kho" hay "Đang giao hàng").
- Ở chặng 13, màn hình shipper ghi điểm đến là *"Người gửi (hoàn hàng)"* với địa chỉ Cầu Giấy, và **không** có ô tick COD.
- Sau khi giao hoàn xong: đơn **Đã hoàn hàng**; bảng `cod_transactions` **không** có dòng nào của đơn 3.

---

## 6. Kiểm tra quyền (làm nhanh trên bất kỳ đơn nào)

| Thử | Kết quả mong đợi |
|---|---|
| `kho.hn.tinh` tìm đơn đang ở chặng 1 | Không có nút thao tác (không phải kho của chặng) |
| `kho.vung.trung` xem chặng 4 khi `kho.vung.bac` chưa xuất kho | Chưa có nút nhập kho (ghi "Chờ chặng trước hoàn tất") |
| `dp.danang` xem trang điều phối | Thấy đơn 1 (chặng 4–7) và đơn 2 (chỉ chặng 4–5, vì trung tâm vùng miền Trung đặt tại Đà Nẵng); **không** thấy đơn 3 |
| `dp.khanhhoa` xem đơn 2 | Chỉ thấy chặng 5–7 |
| `kh.nhan.hcm` mở đơn 1 | Bị chặn (không phải người gửi/nhận) |
| `sp.dn.haichau` mở trang chặng | Chỉ thấy chặng được phân công cho mình |

---

## 7. Bảng tổng kết (điền khi test)

| Bước | Đơn 1 | Đơn 2 | Đơn 3 | Ghi chú lỗi |
|---|---|---|---|---|
| Tạo đơn, lập 7 chặng | ☐ | ☐ | ☐ | |
| Chặng phía Hà Nội (2.x) | ☐ | ☐ | ☐ | |
| Lấy hàng thất bại, phân công lại | – | ☐ | – | |
| Trung chuyển tới kho phát | ☐ | ☐ | ☐ | |
| Kiện hư hỏng tạo cảnh báo | – | ☐ | – | |
| Giao thất bại, nhận lại, giao lại | – | ☐ | ☐ | |
| Thu COD | ☐ | – | không thu (hoàn) | |
| Tự lập tuyến hoàn, hoàn hàng | – | – | ☐ | |
| Người nhận xác nhận | ☐ | ☐ | – | |
| Kiểm tra quyền (mục 6) | ☐ | | | |

**Dọn dữ liệu sau khi test** (SQL Editor, chỉ xóa dữ liệu của các tài khoản test):

```sql
delete from orders where created_by in (select id from users where email like '%@test.delivertrust.com');
delete from contacts where user_id in (select id from users where email like '%@test.delivertrust.com');
-- Giữ tài khoản để test lại; nếu muốn xóa luôn:
-- delete from audit_logs where user_id in (select id from users where email like '%@test.delivertrust.com');
-- delete from users where email like '%@test.delivertrust.com';
```
