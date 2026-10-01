import Link from "next/link";
import { GuestOrderForm } from "@/components/guest/guest-order-form";

export default function GuestOrderPage(): React.JSX.Element {
  return <main className="min-h-screen bg-dt-bg px-4 py-10 text-dt-text">
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-dt-yellow">← Trang chủ</Link>
      <h1 className="mt-5 text-3xl font-semibold">Gửi hàng không cần tài khoản</h1>
      <p className="mb-7 mt-2 text-sm text-dt-muted">Điền thông tin giao nhận và xác thực email bằng OTP để tạo đơn.</p>
      <GuestOrderForm />
      <Link href="/tra-lai-ma" className="mt-6 inline-block text-sm text-dt-yellow underline">Đã gửi hàng? Tra lại mã vận đơn</Link>
    </div>
  </main>;
}
