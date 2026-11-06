import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RoleCode, ShipmentLegStatusCode, ShipmentLegType, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { getVisibleOrderIds } from "@/lib/order-access";
import { ExceptionType, planLegsFromWarehouse } from "@/lib/shipment-exceptions";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const reason = z.string().trim().min(3, "Vui lòng nhập lý do (tối thiểu 3 ký tự)").max(500);

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ExceptionType.WRONG_WAREHOUSE), leg_id: z.string().uuid(), actual_warehouse_id: z.string().uuid(), reason }),
  z.object({ type: z.literal(ExceptionType.WRONG_AREA), order_id: z.string().uuid(), delivery_warehouse_id: z.string().uuid(), reason }),
  z.object({ type: z.literal(ExceptionType.TRANSFER_FAILED), leg_id: z.string().uuid(), reason }),
]);

const LEG_COLUMNS = `id, order_id, sequence_no, leg_type, status, attempt_no, is_return, assigned_staff_id, from_warehouse_id, to_warehouse_id,
  from_warehouse:warehouses!shipment_legs_from_warehouse_id_fkey(id, code, name, province),
  to_warehouse:warehouses!shipment_legs_to_warehouse_id_fkey(id, code, name, province),
  staff:users!shipment_legs_assigned_staff_id_fkey(id, full_name)`;

function canHandle(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

/** Đưa lỗi từ hàm SQL về thông báo tiếng Việt. */
function rpcMessage(message: string): { text: string; status: number } {
  const table: Array<[string, string]> = [
    ["Order is closed or returning", "Đơn đã kết thúc hoặc đang hoàn hàng, không xử lý ngoại lệ được"],
    ["Order already has a return route", "Đơn đã có tuyến hoàn hàng, không xử lý ngoại lệ được"],
    ["Remaining legs already started", "Các chặng phía sau đã bắt đầu hoặc đã có sự kiện, không thể lập lại tuyến"],
    ["Leg cannot be received at another warehouse", "Chỉ chặng lấy hàng/trung chuyển đang vận chuyển mới nhận sai kho được"],
    ["Leg already received", "Chặng này đã được nhập kho"],
    ["Only an in-progress transfer leg can be reset", "Chỉ chặng trung chuyển đang vận chuyển mới báo chuyển kho thất bại được"],
    ["Leg not found", "Không tìm thấy chặng vận chuyển"],
  ];
  const found = table.find(([key]) => message.includes(key));
  return found ? { text: found[1], status: 409 } : { text: message, status: 500 };
}

/**
 * GET /api/shipment-exceptions
 *   ?tracking_code=...  → chi tiết các chặng của đơn + lịch sử ngoại lệ
 *   (không tham số)     → các ngoại lệ gần đây trong phạm vi quyền
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canHandle(auth.roleCode)) return fail("Forbidden", 403);

  const supabase = getSupabaseServiceClient();
  const visible = await getVisibleOrderIds(supabase, auth);
  if (visible.error) return fail(visible.error, visible.status ?? 500);
  const db = supabase as unknown as SupabaseClient;

  const searchParams = new URL(request.url).searchParams;

  // Tìm kho đang hoạt động theo mã/tên/phường (dùng để chọn kho thực tế hoặc kho giao mới).
  const warehouseQuery = searchParams.get("warehouse_q")?.trim();
  if (warehouseQuery) {
    const term = warehouseQuery.replace(/[%,()*]/g, " ").trim().slice(0, 60);
    if (term.length < 2) return ok({ warehouses: [] });
    let query = supabase.from("warehouses")
      .select("id, code, name, province, ward, warehouse_level")
      .eq("status", WarehouseStatusCode.ACTIVE)
      .or(`code.ilike.%${term}%,name.ilike.%${term}%,ward.ilike.%${term}%,province.ilike.%${term}%`)
      .order("code")
      .limit(20);
    if (searchParams.get("level") === WarehouseLevelCode.COMMUNE) query = query.eq("warehouse_level", WarehouseLevelCode.COMMUNE);
    const { data, error } = await query;
    if (error) return fail(error.message, 500);
    return ok({ warehouses: data ?? [] });
  }

  const trackingCode = searchParams.get("tracking_code")?.trim().toUpperCase();
  if (trackingCode) {
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, tracking_code, delivery_warehouse_id, order_statuses(code, name), delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, province), delivery_address:addresses!orders_delivery_address_id_fkey(address_line, ward, district, province)")
      .eq("tracking_code", trackingCode)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!order || (visible.ids && !visible.ids.includes(order.id))) return fail("Không tìm thấy đơn hàng trong phạm vi của bạn", 404);

    const [legs, exceptions] = await Promise.all([
      supabase.from("shipment_legs").select(LEG_COLUMNS).eq("order_id", order.id).order("is_return").order("sequence_no"),
      db.from("shipment_exceptions").select("id, shipment_leg_id, exception_type, reason, details, created_at, creator:users!shipment_exceptions_created_by_fkey(full_name)")
        .eq("order_id", order.id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (legs.error) return fail(legs.error.message, 500);
    if (exceptions.error) return fail(exceptions.error.message, 500);
    return ok({ order, legs: legs.data ?? [], exceptions: exceptions.data ?? [] });
  }

  let query = db.from("shipment_exceptions")
    .select("id, order_id, exception_type, reason, created_at, orders(tracking_code), creator:users!shipment_exceptions_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (visible.ids) {
    if (visible.ids.length === 0) return ok({ recent: [] });
    query = query.in("order_id", visible.ids.slice(0, 1000));
  }
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok({ recent: data ?? [] });
}

interface LegInfo {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: string;
  status: string;
  to_warehouse_id: string | null;
}

/** POST /api/shipment-exceptions — xử lý một ngoại lệ vận chuyển và lập lại tuyến nếu cần. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canHandle(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", 400);
  const input = parsed.data;

  const supabase = getSupabaseServiceClient();
  const db = supabase as unknown as SupabaseClient;
  const visible = await getVisibleOrderIds(supabase, auth);
  if (visible.error) return fail(visible.error, visible.status ?? 500);

  // Xác định đơn và chặng liên quan.
  let leg: LegInfo | null = null;
  let orderId: string;
  if (input.type === ExceptionType.WRONG_AREA) {
    orderId = input.order_id;
  } else {
    const { data, error } = await supabase.from("shipment_legs")
      .select("id, order_id, sequence_no, leg_type, status, to_warehouse_id, is_return").eq("id", input.leg_id).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail("Không tìm thấy chặng vận chuyển", 404);
    if (data.is_return) return fail("Chặng thuộc tuyến hoàn hàng không xử lý bằng chức năng này", 409);
    leg = data;
    orderId = data.order_id;
  }
  if (visible.ids && !visible.ids.includes(orderId)) return fail("Đơn hàng không thuộc phạm vi của bạn", 403);

  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id, delivery_warehouse_id").eq("id", orderId).maybeSingle();
  if (orderError) return fail(orderError.message, 500);
  if (!order) return fail("Không tìm thấy đơn hàng", 404);

  let rpcArgs: Record<string, unknown>;
  let details: Record<string, unknown> = {};

  if (input.type === ExceptionType.WRONG_WAREHOUSE) {
    if (!leg || leg.leg_type === ShipmentLegType.LAST_MILE || leg.status !== ShipmentLegStatusCode.IN_PROGRESS) {
      return fail("Chỉ chặng lấy hàng/trung chuyển đang vận chuyển mới có thể nhập sai kho", 409);
    }
    if (input.actual_warehouse_id === leg.to_warehouse_id) return fail("Kho thực tế trùng kho đích của chặng, không phải nhập sai kho", 400);
    if (!order.delivery_warehouse_id) return fail("Đơn chưa có kho giao hàng", 409);
    const { data: actual } = await supabase.from("warehouses").select("id, status").eq("id", input.actual_warehouse_id).maybeSingle();
    if (!actual) return fail("Không tìm thấy kho thực tế", 404);
    if (actual.status !== WarehouseStatusCode.ACTIVE) return fail("Kho thực tế đang tạm dừng", 409);
    const plan = await planLegsFromWarehouse(input.actual_warehouse_id, order.delivery_warehouse_id);
    if (plan.error) return fail(plan.error, 409);
    details = { expected_warehouse_id: leg.to_warehouse_id, actual_warehouse_id: input.actual_warehouse_id, new_legs: plan.legs.length };
    rpcArgs = { p_leg_id: leg.id, p_keep_through: leg.sequence_no, p_leg_new_to: input.actual_warehouse_id, p_leg_reset: false, p_new_legs: plan.legs, p_new_delivery_wh: null };
  } else if (input.type === ExceptionType.WRONG_AREA) {
    if (input.delivery_warehouse_id === order.delivery_warehouse_id) return fail("Kho giao mới trùng kho giao hiện tại", 400);
    const { data: legs, error: legsError } = await supabase.from("shipment_legs")
      .select("sequence_no, leg_type, status, to_warehouse_id").eq("order_id", orderId).eq("is_return", false).order("sequence_no");
    if (legsError) return fail(legsError.message, 500);
    if (!legs || legs.length === 0) return fail("Đơn chưa được lập tuyến", 409);
    const started = legs.filter((item) => item.status === ShipmentLegStatusCode.IN_PROGRESS || item.status === ShipmentLegStatusCode.COMPLETED || item.status === ShipmentLegStatusCode.FAILED);
    const last = started[started.length - 1];
    if (last?.leg_type === ShipmentLegType.LAST_MILE) {
      return fail("Chặng giao cuối đã bắt đầu; hãy xử lý theo luồng giao thất bại/giao lại", 409);
    }
    const keepThrough = Math.max(last?.sequence_no ?? 1, 1);
    const keepLeg = legs.find((item) => item.sequence_no === keepThrough);
    if (!keepLeg?.to_warehouse_id) return fail("Không xác định được kho đang giữ hàng", 409);
    const plan = await planLegsFromWarehouse(keepLeg.to_warehouse_id, input.delivery_warehouse_id);
    if (plan.error) return fail(plan.error, 409);
    details = { old_delivery_warehouse_id: order.delivery_warehouse_id, new_delivery_warehouse_id: input.delivery_warehouse_id, replanned_from_warehouse_id: keepLeg.to_warehouse_id, new_legs: plan.legs.length };
    rpcArgs = { p_leg_id: null, p_keep_through: keepThrough, p_leg_new_to: null, p_leg_reset: false, p_new_legs: plan.legs, p_new_delivery_wh: input.delivery_warehouse_id };
  } else {
    if (!leg || leg.leg_type !== ShipmentLegType.TRANSFER || leg.status !== ShipmentLegStatusCode.IN_PROGRESS) {
      return fail("Chỉ chặng trung chuyển đang vận chuyển mới báo chuyển kho thất bại được", 409);
    }
    details = { resolution: "RETRY_TRANSFER" };
    rpcArgs = { p_leg_id: leg.id, p_keep_through: null, p_leg_new_to: null, p_leg_reset: true, p_new_legs: null, p_new_delivery_wh: null };
  }

  const { data: exceptionId, error: rpcError } = await db.rpc("apply_shipment_exception", {
    p_order_id: orderId,
    p_actor: auth.userId,
    p_exception_type: input.type,
    p_reason: input.reason,
    p_details: details,
    ...rpcArgs,
  });
  if (rpcError) {
    const mapped = rpcMessage(rpcError.message);
    return fail(mapped.text, mapped.status);
  }

  await writeAuditLog({
    userId: auth.userId,
    action: `SHIPMENT_EXCEPTION_${input.type}`,
    entityType: "order",
    entityId: orderId,
    newData: { exceptionId, reason: input.reason, ...details },
    request,
  });
  return ok({ id: exceptionId, type: input.type }, 201);
}
