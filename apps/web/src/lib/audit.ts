import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  request?: NextRequest;
}

/** Ghi nhật ký thao tác quan trọng. Lỗi ghi log không được làm hỏng nghiệp vụ chính. */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const forwarded = entry.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { error } = await getSupabaseServiceClient().from("audit_logs").insert({
    user_id: entry.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    old_data: (entry.oldData ?? null) as never,
    new_data: (entry.newData ?? null) as never,
    ip_address: forwarded ?? null,
  });
  if (error) console.error("Không ghi được audit log", { action: entry.action, error: error.message });
}
