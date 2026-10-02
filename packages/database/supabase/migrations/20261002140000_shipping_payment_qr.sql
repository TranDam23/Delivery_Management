-- Thanh toán phí vận chuyển bằng VietQR / MoMo theo cách TruyenMa:
--   * Admin cấu hình tài khoản nhận tiền (ngân hàng -> QR VietQR sinh tự động;
--     ví MoMo cá nhân -> ảnh "Mã nhận tiền" tải lên). Mỗi loại chỉ bật một tài khoản.
--   * Tài khoản nhận tiền được CHỤP vào đơn bằng trigger lúc tạo đơn; admin đổi
--     tài khoản sau đó thì đơn cũ vẫn biết tiền phải chuyển vào đâu.
--   * Người thanh toán quét QR rồi báo "Tôi đã chuyển khoản"; đơn vẫn pending cho
--     tới khi admin/điều phối viên (hoặc shipper với tiền mặt) xác nhận đã nhận tiền.
--     Không bao giờ suy ra "paid" từ việc tạo đơn hay từ lời khai của khách.

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bank', 'momo')),
  bank_bin text check (bank_bin ~ '^[0-9]{6}$'),
  bank_code text check (bank_code is null or char_length(bank_code) between 2 and 20),
  bank_name text not null check (char_length(bank_name) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9A-Za-z]{4,30}$'),
  account_name text not null check (char_length(account_name) between 2 and 100),
  qr_image_url text,
  note text not null default '' check (char_length(note) <= 300),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_accounts_bank_needs_bin check (kind <> 'bank' or bank_bin is not null),
  constraint payment_accounts_momo_needs_qr check (kind <> 'momo' or qr_image_url is not null)
);

-- Mỗi loại đúng một tài khoản đang bật: một ngân hàng + một ví MoMo cùng lúc.
create unique index payment_accounts_one_active on public.payment_accounts (kind) where is_active;
create unique index payment_accounts_bank_unique on public.payment_accounts (bank_bin, account_number)
  where kind = 'bank';
create unique index payment_accounts_momo_phone on public.payment_accounts (account_number)
  where kind = 'momo';

comment on table public.payment_accounts is 'Tài khoản nhận tiền phí vận chuyển (VietQR/MoMo). Chỉ service role đọc/ghi, API kiểm quyền Admin.';
comment on column public.payment_accounts.account_name is 'Tên chủ tài khoản, viết HOA không dấu như trên app ngân hàng.';

-- Mọi truy cập đi qua API dùng service role; không mở policy cho anon/authenticated.
alter table public.payment_accounts enable row level security;

create or replace function public.touch_payment_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger payment_accounts_touch
before update on public.payment_accounts
for each row execute function public.touch_payment_account();

alter table public.orders
  add column shipping_payee_kind text check (shipping_payee_kind in ('bank', 'momo')),
  add column shipping_payee_bank_bin text,
  add column shipping_payee_bank_name text,
  add column shipping_payee_account_number text,
  add column shipping_payee_account_name text,
  add column shipping_payee_qr_url text,
  add column shipping_transferred_at timestamptz,
  add column shipping_paid_at timestamptz,
  add column shipping_paid_by uuid references public.users(id) on delete set null;

comment on column public.orders.shipping_payee_account_number is 'Bản chụp tài khoản nhận tiền lúc tạo đơn (VietQR/MoMo).';
comment on column public.orders.shipping_transferred_at is 'Lúc người thanh toán bấm "Tôi đã chuyển khoản"; đơn vẫn chờ nhân viên xác nhận đã nhận tiền.';
comment on column public.orders.shipping_paid_at is 'Lúc nhân viên có thẩm quyền xác nhận đã nhận phí vận chuyển.';

create or replace function public.set_order_shipping_payee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_account public.payment_accounts%rowtype;
begin
  new.shipping_payee_kind := null;
  new.shipping_payee_bank_bin := null;
  new.shipping_payee_bank_name := null;
  new.shipping_payee_account_number := null;
  new.shipping_payee_account_name := null;
  new.shipping_payee_qr_url := null;
  new.shipping_transferred_at := null;
  new.shipping_paid_at := null;
  new.shipping_paid_by := null;

  v_kind := case new.shipping_payment_method when 'vietqr' then 'bank' when 'momo' then 'momo' end;
  if v_kind is null then
    return new;
  end if;

  select * into v_account from public.payment_accounts where is_active and kind = v_kind limit 1;
  if not found then
    raise exception 'Chưa cấu hình tài khoản nhận tiền cho phương thức %', new.shipping_payment_method;
  end if;

  new.shipping_payee_kind := v_account.kind;
  new.shipping_payee_bank_bin := v_account.bank_bin;
  new.shipping_payee_bank_name := v_account.bank_name;
  new.shipping_payee_account_number := v_account.account_number;
  new.shipping_payee_account_name := v_account.account_name;
  new.shipping_payee_qr_url := v_account.qr_image_url;
  return new;
end;
$$;

create trigger orders_set_shipping_payee
before insert on public.orders
for each row execute function public.set_order_shipping_payee();
