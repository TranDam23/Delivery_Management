# Delivery Management — He thong quan ly va xac thuc quy trinh giao nhan hang hoa ung dung Blockchain

Do an tot nghiep. Monorepo TypeScript (pnpm workspaces + Turborepo), kien truc Monolithic.

## Cau truc thu muc

```
Delivery_Management/
├── apps/
│   ├── web/            Next.js 15 (App Router) — web app + REST API (BE monolithic) cho ca web lan mobile
│   └── mobile/          React Native (Expo) — app cho nhan vien giao hang (quet QR, cap nhat trang thai)
├── packages/
│   ├── shared/          Types, enum, constants dung chung (Order, Delivery, BlockchainEvent, ...)
│   ├── database/         Supabase migrations (SQL), seed data, Supabase client helpers, generated DB types
│   └── contracts/        Smart contract Solidity (Hardhat) — ghi nhan su kien giao nhan len Polygon Amoy testnet
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## Stack

- **Ngon ngu**: TypeScript toan bo (web, mobile, backend, smart contract dung Solidity)
- **Web + API**: Next.js 15 (App Router, Route Handlers lam REST API) — kien truc Monolithic, deploy 1 khoi
- **Mobile**: React Native (Expo) — dung chung API voi web
- **Database**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Blockchain**: Solidity smart contract, Hardhat, deploy len Polygon Amoy testnet, tuong tac qua ethers.js
- **QR Code**: `qrcode` (sinh QR o backend), `expo-camera` (quet QR tren mobile)
- **Monorepo**: pnpm workspaces + Turborepo

## Yeu cau moi truong

| Cong cu | Phien ban | Ghi chu |
|---|---|---|
| Node.js | >= 20 (dang dung 22) | |
| pnpm | 11.x | `npm i -g pnpm` |
| Supabase CLI | >= 2.x | da co san trong `packages/database` |
| MetaMask | | de tao vi testnet, chi can khi lam Blockchain |

## Bat dau

### 1. Cai dependencies

```bash
pnpm install
```

### 2. Cau hinh bien moi truong

Copy `.env.example` thanh `.env` trong `apps/web`, `apps/mobile`,
`packages/contracts` va `packages/database`, roi dien gia tri.

File `.env` o thu muc goc chi de **tra cuu** — no liet ke moi bien dung trong
monorepo kem giai thich, khong duoc code doc truc tiep.

Luu y ve `BLOCKCHAIN_PRIVATE_KEY`: dung mot vi MetaMask tao rieng cho do an,
**khong dung vi ca nhan co tien that**. `apps/web` yeu cau key co tien to `0x`
(`packages/contracts` tu chuan hoa nen dang nao cung chay).

### 3. Database (Supabase)

```bash
cd packages/database
supabase login
supabase link --project-ref <your-project-ref>
pnpm supabase:push
```

Sau moi lan doi schema, chay lai `pnpm db:gen-types` o thu muc goc de sinh lai
`packages/database/src/database.types.ts`.

### 4. Smart contract

Chay local truoc — khong can vi, khong can internet, va day cung la phuong an
du phong khi mang Amoy co su co:

```bash
pnpm --filter @delivery/contracts test
pnpm --filter @delivery/contracts node
pnpm --filter @delivery/contracts deploy:local
pnpm --filter @delivery/contracts spike:local
```

Khi da co POL tren Amoy:

```bash
pnpm --filter @delivery/contracts deploy:amoy
pnpm --filter @delivery/contracts spike:amoy
```

Sau khi deploy, copy dia chi contract vao `NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS`
trong `apps/web/.env`.

### 5. Chay du an

```bash
pnpm dev
pnpm dev:web
pnpm dev:mobile
```

## Kiem tra truoc khi mo PR

Bon lenh nay chinh la nhung gi CI chay. Chay het truoc khi push de khong phai
doi CI bao do:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

## Lam viec nhom

Du an do 2 nguoi thuc hien. Ranh gioi so huu tung thu muc, nam diem giao giua
hai phan viec, quy trinh Git va quy tac doi schema nam o
[`docs/PHOI-HOP.md`](docs/PHOI-HOP.md).

Doc file do **truoc khi bat dau GD 2 (Giao nhan)**.

## So do CSDL

Xem migration day du tai [`packages/database/supabase/migrations/00000000000001_init_schema.sql`](packages/database/supabase/migrations/00000000000001_init_schema.sql) — bao gom cac bang: `roles`, `permissions`, `role_permissions`, `users`, `contacts`, `addresses`, `orders`, `order_items`, `order_statuses`, `deliveries`, `delivery_events`, `delivery_attempts`, `cod_transactions`, `blockchain_events`, `notifications`, `audit_logs`, `system_settings`.
