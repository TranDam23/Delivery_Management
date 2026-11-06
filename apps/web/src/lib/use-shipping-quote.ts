"use client";

import { useEffect, useState } from "react";
import type { FeeItem, ShippingServiceType } from "@/lib/shipping-fee";
import type { RouteZone } from "@/lib/tracking-estimate";

export interface ShippingQuote {
  fee: number | null;
  zone: RouteZone | null;
  available: boolean;
  message: string | null;
  breakdown?: {
    baseFee: number;
    weightFee: number;
    extraSteps: number;
    oversizeFee: number;
    areaSurchargeFee: number;
    areaSurchargeNotes: string[];
    volumetric: boolean;
  } | null;
  chargeableKg?: number | null;
}

/** Diễn giải cách tính cước để hiển thị cho người dùng. */
export function describeQuote(quote: ShippingQuote | null): string | null {
  const parts = quote?.breakdown;
  if (!quote || !parts || quote.fee === null) return null;
  const money = (value: number): string => `${value.toLocaleString("vi-VN")}đ`;
  const lines = [`Cước cơ bản ${money(parts.baseFee)}`];
  if (parts.weightFee > 0) lines.push(`+ ${money(parts.weightFee)} cân nặng (${(quote.chargeableKg ?? 0).toFixed(2)} kg tính cước${parts.volumetric ? ", quy đổi theo kích thước" : ""})`);
  if (parts.oversizeFee > 0) lines.push(`+ ${money(parts.oversizeFee)} kiện cồng kềnh`);
  if (parts.areaSurchargeFee > 0) lines.push(`+ ${money(parts.areaSurchargeFee)} phụ phí khu vực`);
  return lines.join(" ");
}

/** Báo giá theo tuyến từ server (có debounce); chưa có tỉnh hai đầu thì chưa báo giá. */
export function useShippingQuote(input: {
  service: ShippingServiceType;
  pickupProvince: string | null | undefined;
  deliveryProvince: string | null | undefined;
  pickupWard?: string | null;
  deliveryWard?: string | null;
  items: FeeItem[];
}): { quote: ShippingQuote | null; loading: boolean } {
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(input);

  useEffect(() => {
    const request = JSON.parse(key) as typeof input;
    if (!request.pickupProvince || !request.deliveryProvince) {
      setQuote(null);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/shipping-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: request.service,
          pickup_province: request.pickupProvince,
          delivery_province: request.deliveryProvince,
          pickup_ward: request.pickupWard || undefined,
          delivery_ward: request.deliveryWard || undefined,
          items: request.items.map((item) => ({ quantity: item.quantity || 1, weight: item.weight || undefined, length: item.length || undefined, width: item.width || undefined, height: item.height || undefined })),
        }),
      })
        .then((response) => response.json())
        .then((payload: { success: boolean; data?: ShippingQuote }) => { if (active) setQuote(payload.success && payload.data ? payload.data : null); })
        .catch(() => { if (active) setQuote(null); })
        .finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [key]);

  return { quote, loading };
}
