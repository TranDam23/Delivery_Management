import { CustomerSidebar } from "@/components/layout/customer-sidebar";

/** Khung man hinh Web cua vai tro khach hang: sidebar 240px + vung noi dung. */
export default function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-dt-bg">
      <CustomerSidebar />
      <main className="flex flex-1 flex-col gap-[18px] px-9 pb-10 pt-8">{children}</main>
    </div>
  );
}
