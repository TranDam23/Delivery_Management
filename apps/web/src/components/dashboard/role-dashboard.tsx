import { RoleCode, type RoleCode as RoleCodeType } from "@delivery/shared";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  Home,
  LayoutDashboard,
  MapPin,
  Package,
  PackageCheck,
  Route,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { LogoutButton } from "@/components/auth/logout-button";
import { CustomerHome } from "@/components/dashboard/customer-home";
import { ROLE_LABEL } from "@/lib/role-routing";

interface RoleDashboardProps {
  roleCode: RoleCodeType;
  heading: string;
  subtitle: string;
  description: string;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string;
}

interface Metric {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "yellow" | "green" | "blue" | "red";
}

const ADMIN_NAV: NavItem[] = [
  { label: "Tổng quan", icon: LayoutDashboard, active: true },
  { label: "Đơn hàng", icon: ClipboardList, badge: "1.248" },
  { label: "Người dùng", icon: Users },
  { label: "Nhân viên", icon: UserRound },
  { label: "Tài xế", icon: Truck },
  { label: "Blockchain", icon: ShieldCheck },
  { label: "COD & Đối soát", icon: WalletCards },
  { label: "Phân tích", icon: BarChart3 },
  { label: "Báo cáo", icon: FileCheck2 },
  { label: "Thông báo", icon: Bell, badge: "3" },
  { label: "Cài đặt", icon: Settings },
];

const DISPATCHER_NAV: NavItem[] = [
  { label: "Tổng quan", icon: LayoutDashboard, active: true },
  { label: "Đơn hàng", icon: ClipboardList, badge: "18" },
  { label: "Chờ phân công", icon: Clock3, badge: "12" },
  { label: "Giao nhận", icon: PackageCheck },
  { label: "Tài xế", icon: Truck },
  { label: "Theo dõi realtime", icon: Activity },
  { label: "Hàng đặc biệt", icon: Package },
  { label: "COD", icon: WalletCards },
  { label: "Hoàn hàng", icon: Route },
  { label: "Cảnh báo", icon: AlertTriangle, badge: "4" },
  { label: "Thông báo", icon: Bell },
  { label: "Tài khoản", icon: Settings },
];

const METRIC_ICON_TONE: Record<Metric["tone"], string> = {
  yellow: "bg-dt-yellow/10 text-dt-yellow",
  green: "bg-dt-green/10 text-dt-green",
  blue: "bg-sky-400/10 text-sky-300",
  red: "bg-dt-red/10 text-red-300",
};

const STATUS_TONE: Record<"success" | "warning" | "danger" | "muted", string> = {
  success: "bg-dt-green/10 text-dt-green",
  warning: "bg-dt-yellow/10 text-dt-yellow",
  danger: "bg-dt-red/10 text-red-300",
  muted: "bg-white/5 text-dt-muted",
};

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: keyof typeof STATUS_TONE;
}): React.JSX.Element {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_TONE[tone]}`}>{children}</span>;
}

function MetricCard({ metric }: { metric: Metric }): React.JSX.Element {
  const Icon = metric.icon;

  return (
    <article className="rounded-dt border border-dt-border bg-dt-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-dt-muted">{metric.label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${METRIC_ICON_TONE[metric.tone]}`}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-dt-text">{metric.value}</p>
      <p className="mt-1 text-[10px] text-dt-muted">{metric.detail}</p>
    </article>
  );
}

function Brand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow text-sm font-black text-dt-bg">DT</span>
      <div>
        <p className="text-[15px] font-semibold tracking-tight text-dt-text">DeliverTrust</p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-dt-muted">Deliver. Track. Verify.</p>
      </div>
    </div>
  );
}

function DesktopSidebar({ navItems, roleCode }: { navItems: NavItem[]; roleCode: RoleCodeType }): React.JSX.Element {
  return (
    <aside className="hidden min-h-screen w-[246px] shrink-0 flex-col border-r border-dt-border bg-dt-side lg:flex">
      <div className="px-5 pb-5 pt-6">
        <Brand />
      </div>
      <div className="mx-5 border-t border-dt-border" />
      <div className="px-4 pt-5">
        <p className="px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-dt-muted">Không gian làm việc</p>
        <nav className="mt-3 space-y-1" aria-label={`Điều hướng ${ROLE_LABEL[roleCode]}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded-md px-3 py-2.5 text-[11px] transition ${
                  item.active ? "bg-dt-yellow text-dt-bg" : "text-dt-muted hover:bg-dt-panel2 hover:text-dt-text"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon size={15} strokeWidth={1.8} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${item.active ? "bg-black/15 text-dt-bg" : "bg-dt-panel text-dt-muted"}`}>
                    {item.badge}
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t border-dt-border px-5 py-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dt-panel2 text-[10px] font-semibold text-dt-yellow">AD</span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-dt-text">Tài khoản hiện tại</p>
            <p className="truncate text-[10px] text-dt-muted">{ROLE_LABEL[roleCode]}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}

function DesktopHome({
  roleCode,
  navItems,
  heading,
  subtitle,
  description,
  metrics,
  children,
}: RoleDashboardProps & { navItems: NavItem[]; metrics: Metric[]; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-dt-bg text-dt-text">
      <DesktopSidebar navItems={navItems} roleCode={roleCode} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
          <header className="flex flex-col gap-5 border-b border-dt-border pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dt-yellow">{ROLE_LABEL[roleCode]}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[28px]">{heading}</h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-dt-muted">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-9 min-w-[210px] items-center gap-2 rounded-md border border-dt-border bg-dt-panel px-3 text-[11px] text-dt-muted md:flex">
                <Search size={15} strokeWidth={1.8} />
                Tìm kiếm nhanh...
                <span className="ml-auto rounded bg-dt-panel2 px-1.5 py-0.5 text-[9px]">Ctrl K</span>
              </div>
              <button type="button" aria-label="Thông báo" className="relative flex h-9 w-9 items-center justify-center rounded-md border border-dt-border bg-dt-panel text-dt-muted hover:text-dt-text">
                <Bell size={16} strokeWidth={1.8} />
                <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-dt-yellow" />
              </button>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dt-yellow text-[10px] font-bold text-dt-bg">AD</span>
            </div>
          </header>

          <div className="mt-5 flex items-start gap-3 rounded-dt border border-dt-border bg-dt-panel px-4 py-3">
            <Activity className="mt-0.5 shrink-0 text-dt-yellow" size={15} strokeWidth={1.8} />
            <p className="text-[11px] leading-5 text-dt-muted">{description}</p>
          </div>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số tổng quan">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

const ADMIN_ORDERS = [
  { code: "ORD-2026-00124", sender: "Công ty Minh Anh", route: "Hà Nội → Đà Nẵng", status: "Đang giao", tone: "warning" as const, time: "09:42" },
  { code: "ORD-2026-00123", sender: "Nguyễn Hoàng Nam", route: "TP. HCM → Cần Thơ", status: "Đã giao", tone: "success" as const, time: "09:18" },
  { code: "ORD-2026-00122", sender: "Lê Thu Hà", route: "Hải Phòng → Hà Nội", status: "Chờ phân công", tone: "muted" as const, time: "08:56" },
  { code: "ORD-2026-00121", sender: "Nội thất An Khang", route: "Đà Nẵng → Huế", status: "Có cảnh báo", tone: "danger" as const, time: "08:31" },
];

function AdminHome(props: RoleDashboardProps): React.JSX.Element {
  const metrics: Metric[] = [
    { label: "Đơn đang xử lý", value: "1.248", detail: "+8,4% so với hôm qua", icon: ClipboardList, tone: "yellow" },
    { label: "Đơn đã giao", value: "1.892", detail: "96,2% đúng thời gian", icon: PackageCheck, tone: "green" },
    { label: "Tài khoản hoạt động", value: "384", detail: "12 tài khoản mới tuần này", icon: Users, tone: "blue" },
    { label: "Cảnh báo cần xử lý", value: "13", detail: "4 cảnh báo mức nghiêm trọng", icon: AlertTriangle, tone: "red" },
  ];

  return (
    <DesktopHome {...props} navItems={ADMIN_NAV} metrics={metrics}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <section className="rounded-dt border border-dt-border bg-dt-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Đơn hàng gần đây</p>
              <p className="mt-1 text-[10px] text-dt-muted">Tổng hợp hoạt động mới nhất trên toàn hệ thống</p>
            </div>
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-dt-border px-3 py-2 text-[10px] text-dt-muted hover:text-dt-text">
              Xem tất cả <ArrowUpRight size={13} strokeWidth={1.8} />
            </button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dt-border text-[9px] uppercase tracking-[0.12em] text-dt-muted">
                  <th className="pb-3 font-medium">Mã đơn</th>
                  <th className="pb-3 font-medium">Người gửi</th>
                  <th className="pb-3 font-medium">Tuyến</th>
                  <th className="pb-3 font-medium">Trạng thái</th>
                  <th className="pb-3 text-right font-medium">Giờ</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_ORDERS.map((order) => (
                  <tr key={order.code} className="border-b border-dt-border/70 last:border-0">
                    <td className="py-4 text-[11px] font-medium text-dt-yellow">{order.code}</td>
                    <td className="py-4 text-[11px] text-dt-text">{order.sender}</td>
                    <td className="py-4 text-[11px] text-dt-muted">{order.route}</td>
                    <td className="py-4"><StatusPill tone={order.tone}>{order.status}</StatusPill></td>
                    <td className="py-4 text-right text-[10px] text-dt-muted">{order.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-dt border border-dt-border bg-dt-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Toàn vẹn Blockchain</p>
                <p className="mt-1 text-[10px] text-dt-muted">Kiểm tra dữ liệu hành trình gần nhất</p>
              </div>
              <ShieldCheck className="text-dt-green" size={19} strokeWidth={1.8} />
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-md border border-dt-green/20 bg-dt-green/5 p-3">
              <CheckCircle2 className="shrink-0 text-dt-green" size={17} strokeWidth={1.8} />
              <div>
                <p className="text-[11px] font-medium text-dt-green">Mạng lưới đang đồng bộ</p>
                <p className="mt-1 text-[10px] text-dt-muted">1.248 sự kiện đã xác minh hôm nay</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {["ORD-2026-00124", "ORD-2026-00123", "ORD-2026-00120"].map((code, index) => (
                <div key={code} className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="flex min-w-0 items-center gap-2 text-dt-muted"><FileCheck2 size={13} className="text-dt-yellow" /> <span className="truncate">{code}</span></span>
                  <span className="shrink-0 text-dt-green">{index === 2 ? "2 phút trước" : `${index + 1}0 phút trước`}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-dt border border-dt-border bg-dt-panel p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Cần chú ý</p>
              <AlertTriangle className="text-dt-yellow" size={18} strokeWidth={1.8} />
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-dt-red/20 bg-dt-red/5 p-3">
                <p className="text-[11px] font-medium text-red-200">4 đơn giao trễ</p>
                <p className="mt-1 text-[10px] text-dt-muted">Cần điều phối lại trước 10:00</p>
              </div>
              <div className="rounded-md border border-dt-yellow/20 bg-dt-yellow/5 p-3">
                <p className="text-[11px] font-medium text-dt-yellow">9 tài khoản chờ xác minh</p>
                <p className="mt-1 text-[10px] text-dt-muted">Kiểm tra trong mục Người dùng</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DesktopHome>
  );
}

const DISPATCHER_ORDERS = [
  { code: "ORD-2026-00124", area: "Cầu Giấy → Đống Đa", driver: "Chưa phân công", tone: "danger" as const, status: "Cần xử lý" },
  { code: "ORD-2026-00123", area: "Thanh Khê → Hải Châu", driver: "Trần Minh Đức", tone: "success" as const, status: "Đang giao" },
  { code: "ORD-2026-00122", area: "Lê Chân → Hồng Bàng", driver: "Phạm Quốc Huy", tone: "warning" as const, status: "Đã lấy hàng" },
];

function DispatcherHome(props: RoleDashboardProps): React.JSX.Element {
  const metrics: Metric[] = [
    { label: "Đơn trong ca", value: "18", detail: "6 đơn mới trong 30 phút", icon: ClipboardList, tone: "yellow" },
    { label: "Chờ phân công", value: "12", detail: "3 đơn ưu tiên cao", icon: Clock3, tone: "red" },
    { label: "Tài xế đang hoạt động", value: "85", detail: "72 tài xế đang trên tuyến", icon: Truck, tone: "green" },
    { label: "Cảnh báo tuyến", value: "06", detail: "2 tuyến đang ùn tắc", icon: AlertTriangle, tone: "blue" },
  ];

  return (
    <DesktopHome {...props} navItems={DISPATCHER_NAV} metrics={metrics}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <section className="overflow-hidden rounded-dt border border-dt-border bg-dt-panel">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
            <div>
              <p className="text-sm font-semibold">Bản đồ điều phối</p>
              <p className="mt-1 text-[10px] text-dt-muted">Vị trí mô phỏng của tài xế và đơn hàng trong khu vực</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-dt-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-dt-green" /> Tài xế</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-dt-yellow" /> Đơn hàng</span>
            </div>
          </div>
          <div className="relative mx-5 mb-5 min-h-[330px] overflow-hidden rounded-md border border-dt-border bg-[#17191e] bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px]">
            <div className="absolute left-[13%] top-[22%] h-px w-[62%] rotate-[18deg] bg-dt-yellow/25" />
            <div className="absolute left-[21%] top-[67%] h-px w-[70%] -rotate-[12deg] bg-dt-green/25" />
            <div className="absolute left-[54%] top-[8%] h-[85%] w-px rotate-[13deg] bg-white/10" />
            <div className="absolute left-[18%] top-[25%] flex h-7 w-7 items-center justify-center rounded-full border border-dt-green/40 bg-dt-green/15 text-dt-green"><Truck size={14} /></div>
            <div className="absolute left-[68%] top-[34%] flex h-7 w-7 items-center justify-center rounded-full border border-dt-green/40 bg-dt-green/15 text-dt-green"><Truck size={14} /></div>
            <div className="absolute left-[42%] top-[57%] flex h-7 w-7 items-center justify-center rounded-full border border-dt-yellow/40 bg-dt-yellow/15 text-dt-yellow"><MapPin size={14} /></div>
            <div className="absolute left-[78%] top-[70%] flex h-7 w-7 items-center justify-center rounded-full border border-dt-yellow/40 bg-dt-yellow/15 text-dt-yellow"><MapPin size={14} /></div>
            <div className="absolute bottom-4 left-4 rounded-md border border-dt-border bg-dt-bg/90 px-3 py-2 text-[10px] text-dt-muted">
              <span className="text-dt-text">Hôm nay, 09:45</span> · Cập nhật trực tiếp
            </div>
            <div className="absolute right-4 top-4 rounded-md border border-dt-border bg-dt-bg/90 px-3 py-2 text-[10px] text-dt-muted">Hà Nội · 42 đơn</div>
          </div>
        </section>

        <section className="rounded-dt border border-dt-border bg-dt-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Hàng đợi cần xử lý</p>
              <p className="mt-1 text-[10px] text-dt-muted">Ưu tiên những đơn chưa có tài xế</p>
            </div>
            <span className="rounded-full bg-dt-red/10 px-2 py-1 text-[10px] text-red-300">12 đơn</span>
          </div>
          <div className="mt-5 space-y-3">
            {DISPATCHER_ORDERS.map((order) => (
              <div key={order.code} className="rounded-md border border-dt-border bg-dt-panel2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-medium text-dt-yellow">{order.code}</p>
                  <StatusPill tone={order.tone}>{order.status}</StatusPill>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-dt-muted"><MapPin size={12} />{order.area}</p>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-dt-muted"><Truck size={12} />{order.driver}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted hover:text-dt-text">
            Mở toàn bộ hàng đợi <ChevronRight size={13} />
          </button>
        </section>
      </div>

      <section className="mt-6 rounded-dt border border-dt-border bg-dt-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Trạng thái giao nhận trong ca</p>
            <p className="mt-1 text-[10px] text-dt-muted">Theo dõi tiến độ để xử lý sớm các điểm nghẽn</p>
          </div>
          <button type="button" className="flex items-center gap-1 text-[10px] text-dt-yellow">Xem báo cáo <ArrowUpRight size={13} /></button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {DISPATCHER_ORDERS.map((order) => (
            <div key={order.code} className="flex items-center justify-between gap-3 rounded-md border border-dt-border bg-dt-panel2 p-3">
              <div className="min-w-0"><p className="truncate text-[11px] font-medium">{order.code}</p><p className="mt-1 text-[10px] text-dt-muted">{order.area}</p></div>
              <StatusPill tone={order.tone}>{order.status}</StatusPill>
            </div>
          ))}
        </div>
      </section>
    </DesktopHome>
  );
}

function DeliveryHome({ heading, subtitle, description }: Omit<RoleDashboardProps, "roleCode">): React.JSX.Element {
  const mobileNav = [
    { label: "Trang chủ", icon: Home, active: true },
    { label: "Đơn hàng", icon: ClipboardList },
    { label: "Quét QR", icon: ScanLine },
    { label: "Thông báo", icon: Bell },
    { label: "Tài khoản", icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col border-x border-dt-border bg-[#111216]">
        <header className="flex items-center justify-between border-b border-dt-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dt-yellow text-[10px] font-bold text-dt-bg">TX</span>
            <div><p className="text-[11px] font-medium">Xin chào, Minh Đức</p><p className="mt-0.5 text-[9px] text-dt-muted">{heading}</p></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Thông báo" className="flex h-8 w-8 items-center justify-center rounded-full text-dt-muted hover:bg-dt-panel2 hover:text-dt-text"><Bell size={16} /></button>
            <div className="w-[74px]"><LogoutButton /></div>
          </div>
        </header>
        <main className="flex-1 px-5 pb-6 pt-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dt-yellow">Ca sáng · 09:45</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sẵn sàng giao hàng?</h1>
            <p className="mt-2 text-[11px] leading-5 text-dt-muted">{subtitle}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><p className="text-[10px] text-dt-muted">Đơn trong ngày</p><p className="mt-3 text-2xl font-semibold">08</p><p className="mt-1 text-[10px] text-dt-green">+2 đơn mới</p></div>
            <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><p className="text-[10px] text-dt-muted">Đã hoàn tất</p><p className="mt-3 text-2xl font-semibold">05</p><p className="mt-1 text-[10px] text-dt-muted">62,5% tiến độ</p></div>
          </div>

          <section className="mt-4 rounded-dt border border-dt-yellow/35 bg-dt-panel p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-dt-yellow">Đơn tiếp theo</p><p className="mt-2 text-base font-semibold">ORD-2026-00124</p></div><StatusPill tone="warning">Đang chờ lấy hàng</StatusPill></div>
            <div className="mt-4 space-y-3 border-t border-dt-border pt-4">
              <p className="flex items-start gap-2 text-[11px] text-dt-text"><UserRound className="mt-0.5 shrink-0 text-dt-muted" size={14} />Người nhận: Nguyễn Hoàng Nam · 090 123 4567</p>
              <p className="flex items-start gap-2 text-[11px] leading-5 text-dt-text"><MapPin className="mt-0.5 shrink-0 text-dt-muted" size={14} />42 Nguyễn Thái Học, Ba Đình, Hà Nội</p>
              <p className="flex items-center gap-2 text-[11px] text-dt-text"><WalletCards className="text-dt-muted" size={14} />COD cần thu: <span className="font-semibold text-dt-yellow">450.000đ</span></p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" className="flex items-center justify-center gap-1.5 rounded-md bg-dt-yellow py-2.5 text-[10px] font-semibold text-dt-bg"><Route size={14} />Bắt đầu giao</button><button type="button" className="flex items-center justify-center gap-1.5 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted"><MapPin size={14} />Xem bản đồ</button></div>
          </section>

          <div className="mt-4 rounded-dt border border-dt-border bg-dt-panel2 p-4"><div className="flex items-center gap-3"><Clock3 className="text-dt-yellow" size={17} /><div><p className="text-[11px] font-medium">Nhắc việc trong ca</p><p className="mt-1 text-[10px] leading-4 text-dt-muted">Quét mã kiện hàng trước khi rời điểm lấy hàng.</p></div></div></div>
          <p className="mt-4 text-[10px] leading-4 text-dt-muted">{description}</p>
        </main>
        <nav className="sticky bottom-0 grid grid-cols-5 border-t border-dt-border bg-[#15161b]/95 px-2 py-2 backdrop-blur" aria-label="Điều hướng nhân viên giao nhận">
          {mobileNav.map((item) => { const Icon = item.icon; return <div key={item.label} className={`flex flex-col items-center gap-1 py-1.5 text-[9px] ${item.active ? "text-dt-yellow" : "text-dt-muted"}`}><Icon size={16} strokeWidth={1.8} /><span>{item.label}</span></div>; })}
        </nav>
      </div>
    </div>
  );
}

/** Trang home theo role, trong do CUSTOMER dung dashboard chung cho luong gui/nhan. */
export function RoleDashboard({ roleCode, heading, subtitle, description }: RoleDashboardProps): React.JSX.Element {
  return (
    <AuthGuard allowedRole={roleCode}>
      {roleCode === RoleCode.ADMIN ? <AdminHome roleCode={roleCode} heading={heading} subtitle={subtitle} description={description} /> : null}
      {roleCode === RoleCode.DISPATCHER ? <DispatcherHome roleCode={roleCode} heading={heading} subtitle={subtitle} description={description} /> : null}
      {roleCode === RoleCode.DELIVERY_STAFF ? <DeliveryHome heading={heading} subtitle={subtitle} description={description} /> : null}
      {roleCode === RoleCode.CUSTOMER ? <CustomerHome /> : null}
    </AuthGuard>
  );
}
