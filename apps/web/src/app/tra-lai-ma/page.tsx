import Link from "next/link";
import { GuestOrderLookup } from "@/components/guest/guest-order-lookup";

export default function GuestOrderLookupPage(): React.JSX.Element {
  return <main className="min-h-screen bg-dt-bg px-4 py-10 text-dt-text"><div className="mx-auto max-w-xl">
    <Link href="/" className="text-sm text-dt-yellow">← Trang chủ</Link>
    <h1 className="mt-5 text-3xl font-semibold">Tra lại mã vận đơn</h1>
    <p className="mb-7 mt-2 text-sm text-dt-muted">Nhập email người gửi và mã OTP để xem các đơn gắn với email đó. Có thể nhập thêm số điện thoại để lọc; không thể xem đơn chỉ bằng số điện thoại.</p>
    <GuestOrderLookup />
  </div></main>;
}
