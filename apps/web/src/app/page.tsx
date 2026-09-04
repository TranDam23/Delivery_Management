import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Lock,
  MapPin,
  Route,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    icon: Route,
    title: "Theo dõi từng chặng",
    description: "Cập nhật rõ ràng từ lúc tạo đơn, lấy hàng, trung chuyển đến khi giao thành công.",
  },
  {
    icon: ShieldCheck,
    title: "Xác minh bằng Blockchain",
    description: "Các mốc quan trọng được ghi nhận để hành trình có thể đối chiếu và kiểm chứng.",
  },
  {
    icon: Lock,
    title: "Bảo mật thông tin",
    description: "Thông tin người gửi, người nhận và đơn hàng chỉ được hiển thị đúng phạm vi.",
  },
];

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen overflow-hidden bg-dt-bg text-dt-text">
      <header className="relative z-10 border-b border-dt-border/80 bg-dt-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-5 px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow text-sm font-black text-dt-bg">DT</span>
            <span>
              <span className="block text-[15px] font-semibold tracking-tight">DeliverTrust</span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-[0.18em] text-dt-muted">Deliver. Track. Verify.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] text-dt-muted md:flex" aria-label="Điều hướng trang chủ">
            <Link href="/" className="hover:text-dt-text">Trang chủ</Link>
            <a href="#tra-cuu" className="hover:text-dt-text">Tra cứu vận đơn</a>
            <a href="#tinh-nang" className="hover:text-dt-text">Tính năng</a>
            <a href="#cach-hoat-dong" className="hover:text-dt-text">Cách hoạt động</a>
            <a href="#minh-bach" className="hover:text-dt-text">Blockchain</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-dt-yellow px-4 py-2.5 text-[11px] font-semibold text-dt-bg transition hover:brightness-110">
              Đăng nhập <ArrowRight size={14} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      <section id="gioi-thieu" className="relative">
        <div className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-dt-yellow/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-amber-200/5 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1240px] gap-12 px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-dt-yellow/30 bg-dt-yellow/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dt-yellow">
              <span className="h-1.5 w-1.5 rounded-full bg-dt-green" /> Nền tảng giao nhận minh bạch
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              Gửi hàng dễ dàng.
              <span className="block text-dt-yellow">Theo dõi rõ ràng.</span>
              An tâm từng chặng.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-dt-muted md:text-base">
              DeliverTrust kết nối người gửi, người nhận và đội ngũ giao nhận trong một hành trình có thể theo dõi, xác minh và tin cậy.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-dt-yellow px-5 py-3 text-xs font-semibold text-dt-bg transition hover:brightness-110">
                Bắt đầu sử dụng <ArrowRight size={15} />
              </Link>
              <a href="#tinh-nang" className="inline-flex items-center gap-2 rounded-md border border-dt-border px-5 py-3 text-xs text-dt-muted transition hover:border-dt-yellow/50 hover:text-dt-text">
                Khám phá tính năng <ChevronRight size={15} />
              </a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-[10px] text-dt-muted">
              <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-dt-green" />Theo dõi theo thời gian thực</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-dt-green" />Xác minh hành trình</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="absolute -inset-3 rounded-[14px] border border-dt-yellow/10" />
            <section id="tra-cuu" className="relative rounded-dt border border-dt-border bg-dt-panel p-5 shadow-2xl shadow-black/20 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dt-yellow">Hành trình của bạn</p>
                  <h2 className="mt-2 text-lg font-semibold">Tra cứu vận đơn</h2>
                  <p className="mt-1 text-[10px] text-dt-muted">Theo dõi trạng thái đơn hàng minh bạch</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow/10 text-dt-yellow"><Search size={18} /></span>
              </div>
              <div className="mt-6 rounded-md border border-dt-border bg-dt-panel2 p-3">
                <p className="text-[9px] uppercase tracking-[0.12em] text-dt-muted">Mã vận đơn mẫu</p>
                <div className="mt-2 flex items-center justify-between gap-3"><span className="text-sm font-medium text-dt-text">ORD-2026-00124</span><span className="rounded-full bg-dt-green/10 px-2.5 py-1 text-[10px] text-dt-green">Đang giao</span></div>
              </div>
              <div className="mt-6 space-y-5">
                <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dt-green/15 text-dt-green"><CheckCircle2 size={15} /></span><div><p className="text-xs font-medium">Đã lấy hàng</p><p className="mt-1 text-[10px] text-dt-muted">Hôm nay, 08:20 · Kho Cầu Giấy</p></div></div>
                <div className="ml-3.5 h-5 border-l border-dt-border" />
                <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dt-yellow/50 bg-dt-yellow/10 text-dt-yellow"><Truck size={14} /></span><div><p className="text-xs font-medium">Đang trên đường giao</p><p className="mt-1 text-[10px] text-dt-muted">Cập nhật 09:42 · Tài xế đang di chuyển</p></div></div>
                <div className="ml-3.5 h-5 border-l border-dt-border" />
                <div className="flex gap-3 opacity-50"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dt-border text-dt-muted"><MapPin size={14} /></span><div><p className="text-xs font-medium">Dự kiến giao thành công</p><p className="mt-1 text-[10px] text-dt-muted">Trước 18:00 hôm nay</p></div></div>
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-md border border-dt-green/20 bg-dt-green/5 p-3 text-[10px] text-dt-muted"><ShieldCheck className="shrink-0 text-dt-green" size={15} />Mốc hành trình được xác minh trên Blockchain</div>
              <Link href="/login" className="mt-4 flex items-center justify-center gap-2 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted transition hover:border-dt-yellow/50 hover:text-dt-text">Đăng nhập để quản lý đơn hàng <ArrowRight size={13} /></Link>
            </section>
          </div>
        </div>
      </section>

      <section id="tinh-nang" className="border-y border-dt-border bg-dt-panel/40">
        <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8 md:py-16">
          <div id="cach-hoat-dong" className="max-w-xl"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dt-yellow">Một nền tảng cho mọi vai trò</p><h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Mọi cập nhật đều rõ ràng ngay từ đầu.</h2><p className="mt-3 text-sm leading-6 text-dt-muted">Khách vãng lai có thể tìm hiểu và theo dõi hành trình; tài khoản đã đăng nhập sẽ được đưa đến đúng không gian làm việc theo quyền.</p></div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature) => { const Icon = feature.icon; return <article key={feature.title} className="rounded-dt border border-dt-border bg-dt-panel p-5"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow/10 text-dt-yellow"><Icon size={18} /></span><h3 className="mt-5 text-sm font-semibold">{feature.title}</h3><p className="mt-2 text-xs leading-5 text-dt-muted">{feature.description}</p></article>; })}
          </div>
        </div>
      </section>

      <section id="minh-bach" className="mx-auto grid max-w-[1240px] gap-8 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div><div className="flex h-11 w-11 items-center justify-center rounded-md bg-dt-yellow text-dt-bg"><FileCheck2 size={21} /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight md:text-3xl">Tin cậy được xây dựng từ dữ liệu có thể kiểm chứng.</h2><p className="mt-4 text-sm leading-6 text-dt-muted">DeliverTrust ghi nhận các mốc quan trọng của hành trình để người dùng không phải chỉ “tin vào một trạng thái”, mà có thể đối chiếu nguồn gốc cập nhật.</p><Link href="/login" className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-dt-yellow hover:text-amber-200">Đăng nhập để tiếp tục <ArrowRight size={14} /></Link></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-dt border border-dt-border bg-dt-panel p-5 sm:col-span-2"><div className="flex items-center gap-3"><ShieldCheck className="text-dt-green" size={20} /><p className="text-sm font-semibold">Bằng chứng hành trình</p></div><p className="mt-3 text-xs leading-5 text-dt-muted">Mã vận đơn, thời gian, trạng thái và người thực hiện được liên kết xuyên suốt vòng đời giao nhận.</p></div><div className="rounded-dt border border-dt-border bg-dt-panel p-5"><Truck className="text-dt-yellow" size={19} /><p className="mt-4 text-sm font-semibold">Điều phối hiệu quả</p><p className="mt-2 text-xs leading-5 text-dt-muted">Đúng đơn, đúng người, đúng thời điểm.</p></div><div className="rounded-dt border border-dt-border bg-dt-panel p-5"><Lock className="text-sky-300" size={19} /><p className="mt-4 text-sm font-semibold">Riêng tư theo quyền</p><p className="mt-2 text-xs leading-5 text-dt-muted">Mỗi tài khoản chỉ nhìn thấy đúng dữ liệu cần thiết.</p></div></div>
      </section>

      <footer className="border-t border-dt-border">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-6 text-[10px] text-dt-muted sm:flex-row sm:items-center sm:justify-between md:px-8"><p>© 2026 DeliverTrust · Deliver. Track. Verify.</p><p>Trang chủ công khai · Không cần đăng nhập để xem thông tin giới thiệu</p></div>
      </footer>
    </main>
  );
}
