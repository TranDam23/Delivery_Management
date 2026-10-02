/** Product-level fallback until dispatch supplies a route-specific ETA. */
export function estimateDeliveryDate(
  createdAt: string,
  serviceType: string,
  scheduledAt: string | null,
): { date: string | null; source: "scheduled" | "service" } {
  if (scheduledAt && !Number.isNaN(Date.parse(scheduledAt))) return { date: scheduledAt, source: "scheduled" };
  const createdTime = Date.parse(createdAt);
  if (Number.isNaN(createdTime)) return { date: null, source: "service" };
  // Indicative windows, not a promised delivery date. No route/SLA engine exists yet.
  if (serviceType === "same_day") {
    const dayMs = 24 * 60 * 60 * 1000;
    const vietNamOffsetMs = 7 * 60 * 60 * 1000;
    const endOfLocalDay = (Math.floor((createdTime + vietNamOffsetMs) / dayMs) + 1) * dayMs - vietNamOffsetMs - 60_000;
    return { date: new Date(Math.max(createdTime, endOfLocalDay)).toISOString(), source: "service" };
  }
  const hours = serviceType === "express" ? 24 : serviceType === "standard" ? 72 : null;
  return { date: hours === null ? null : new Date(createdTime + hours * 60 * 60 * 1000).toISOString(), source: "service" };
}
