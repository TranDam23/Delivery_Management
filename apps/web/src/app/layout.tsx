import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "He thong quan ly giao nhan hang hoa | Blockchain",
  description:
    "He thong quan ly va xac thuc quy trinh giao nhan hang hoa ung dung Blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
