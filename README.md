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

## Bat dau

### 1. Cai dependencies

```bash
pnpm install
```

### 2. Cau hinh bien moi truong

Copy `.env.example` thanh `.env` trong `apps/web`, `apps/mobile`, `packages/contracts` roi dien gia tri (xem chi tiet trong `.env.example` o moi thu muc).

### 3. Database (Supabase)

```bash
cd packages/database
supabase login
supabase link --project-ref <your-project-ref>
pnpm supabase:push       # ap dung migration trong supabase/migrations
```

### 4. Smart contract

```bash
cd packages/contracts
pnpm compile
pnpm deploy:amoy          # deploy len Polygon Amoy testnet
```

Sau khi deploy, copy dia chi contract vao `NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS` trong `apps/web/.env`.

### 5. Chay du an

```bash
pnpm dev             # chay tat ca (web + mobile) qua turborepo
pnpm dev:web          # chi chay Next.js (http://localhost:3000)
pnpm dev:mobile        # chi chay Expo (quet QR bang Expo Go)
```

## So do CSDL

Xem migration day du tai [`packages/database/supabase/migrations/00000000000001_init_schema.sql`](packages/database/supabase/migrations/00000000000001_init_schema.sql) — bao gom cac bang: `roles`, `permissions`, `role_permissions`, `users`, `contacts`, `addresses`, `orders`, `order_items`, `order_statuses`, `deliveries`, `delivery_events`, `delivery_attempts`, `cod_transactions`, `blockchain_events`, `notifications`, `audit_logs`, `system_settings`.
