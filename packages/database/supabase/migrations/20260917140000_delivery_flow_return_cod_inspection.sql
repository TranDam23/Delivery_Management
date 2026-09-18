-- ============================================================================
-- Hoàn thiện luồng giao nhận:
-- 1) Tuyến hoàn hàng về người gửi sau khi hết số lần giao.
-- 2) Kết quả kiểm hàng khi nhập kho (tình trạng kiện, cân nặng thực tế).
-- 3) Mỗi đơn chỉ có một giao dịch thu hộ COD.
-- 4) Lưu payload đã chuẩn hóa để đối chiếu hash với Blockchain.
-- ============================================================================

-- 1) Đánh dấu chặng thuộc tuyến hoàn. Các chặng hoàn được nối tiếp sau chặng
-- giao cuối thất bại, dùng chung sequence_no của đơn.
alter table shipment_legs
  add column if not exists is_return boolean not null default false;

create index if not exists idx_shipment_legs_order_return
  on shipment_legs (order_id, is_return, sequence_no);

-- 2) Kết quả kiểm hàng. Chỉ bắt buộc ở tầng API cho sự kiện nhập kho, vì
-- xuất kho không kiểm lại kiện.
alter table warehouse_events
  add column if not exists package_condition text,
  add column if not exists actual_weight_kg numeric(10, 3);

alter table warehouse_events
  drop constraint if exists warehouse_events_package_condition_check;

alter table warehouse_events
  add constraint warehouse_events_package_condition_check
  check (package_condition is null or package_condition in ('INTACT', 'DAMAGED'));

alter table warehouse_events
  drop constraint if exists warehouse_events_actual_weight_check;

alter table warehouse_events
  add constraint warehouse_events_actual_weight_check
  check (actual_weight_kg is null or actual_weight_kg > 0);

-- 3) Một đơn chỉ thu hộ một lần.
create unique index if not exists idx_cod_transactions_unique_order
  on cod_transactions (order_id);

-- 4) Payload gốc (đã chuẩn hóa thứ tự key) của sự kiện ghi lên chain.
alter table blockchain_events
  add column if not exists event_payload jsonb;

-- Bảo đảm đủ trạng thái hoàn hàng trên các môi trường seed cũ.
insert into order_statuses (code, name, description, is_final)
values
  ('RETURNING', 'Đang hoàn hàng', 'Hàng đang được hoàn trả về người gửi', false),
  ('RETURNED', 'Đã hoàn hàng', 'Hàng đã hoàn trả thành công về người gửi', true)
on conflict (code) do nothing;
