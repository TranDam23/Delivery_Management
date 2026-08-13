import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OrderStatusCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

const createOrderSchema = z.object({
  sender_id: z.string().uuid(),
  receiver_id: z.string().uuid(),
  pickup_address_id: z.string().uuid(),
  delivery_address_id: z.string().uuid(),
  service_type: z.string().default("standard"),
  cod_amount: z.number().nonnegative().default(0),
  total_fee: z.number().nonnegative().default(0),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        item_name: z.string().min(1),
        item_type: z.string().optional(),
        quantity: z.number().int().positive().default(1),
        weight: z.number().optional(),
        length: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        declared_value: z.number().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

function generateTrackingCode(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `DH${ymd}${suffix}`;
}

/** GET /api/orders — danh sach don hang (loc theo status, phan trang). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");
  const statusCode = searchParams.get("status");

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("orders")
    .select(
      "id, tracking_code, qr_code, service_type, cod_amount, total_fee, note, created_at, order_statuses(code, name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (statusCode) {
    query = query.eq("order_statuses.code", statusCode);
  }

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);

  return ok({ items: data, total: count ?? 0, page, pageSize });
}

/** POST /api/orders — tao don hang moi, sinh tracking_code + QR, ghi su kien ORDER_CREATED. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();

  const { data: createdStatus, error: statusError } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("code", OrderStatusCode.CREATED)
    .single();
  if (statusError || !createdStatus) return fail("Order status seed missing", 500);

  const trackingCode = generateTrackingCode();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tracking_code: trackingCode,
      qr_code: trackingCode,
      sender_id: parsed.data.sender_id,
      receiver_id: parsed.data.receiver_id,
      pickup_address_id: parsed.data.pickup_address_id,
      delivery_address_id: parsed.data.delivery_address_id,
      service_type: parsed.data.service_type,
      cod_amount: parsed.data.cod_amount,
      total_fee: parsed.data.total_fee,
      note: parsed.data.note ?? null,
      status_id: createdStatus.id,
      created_by: auth.userId,
    })
    .select("id, tracking_code, qr_code")
    .single();

  if (orderError) return fail(orderError.message, 500);

  const items = parsed.data.items.map((item) => ({ ...item, order_id: order.id }));
  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) return fail(itemsError.message, 500);

  // TODO: goi recordDeliveryEventOnChain({ eventType: "ORDER_CREATED", ... })
  // va luu ket qua (transaction_hash, block_number) vao bang blockchain_events.

  return ok(order, 201);
}
