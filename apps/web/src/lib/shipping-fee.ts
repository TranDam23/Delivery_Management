export const SHIPPING_BASE_FEE = { standard: 30000, express: 50000, same_day: 70000 } as const;
export type ShippingServiceType = keyof typeof SHIPPING_BASE_FEE;

/** Demo tariff used by the web form. Recalculate on the server; never trust total_fee from the browser. */
export function calculateShippingFee(service: ShippingServiceType, items: Array<{ weight?: number; quantity: number }>): number {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
  return Math.round(SHIPPING_BASE_FEE[service] + Math.max(0, totalWeight - 1) * 5000);
}
