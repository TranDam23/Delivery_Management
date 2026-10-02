"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PaymentMethodAvailability } from "@/lib/payment-accounts";

/** Phương thức QR nào đang có tài khoản nhận tiền; lỗi mạng thì coi như chỉ có tiền mặt. */
export function usePaymentAvailability(): PaymentMethodAvailability {
  const [availability, setAvailability] = useState<PaymentMethodAvailability>({ vietqr: false, momo: false });
  useEffect(() => {
    let active = true;
    apiFetch<PaymentMethodAvailability>("/api/payment-accounts?available=1")
      .then((data) => { if (active) setAvailability(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return availability;
}
