/**
 * Ngân hàng hỗ trợ VietQR (chuẩn NAPAS 247) và tiện ích sinh mã QR chuyển khoản.
 * Không import gì phía server nên Client Component dùng được.
 */

export type Bank = {
  /** Mã BIN 6 số, là thứ thực sự được mã hoá vào QR. */
  bin: string;
  code: string;
  name: string;
};

export const BANKS: Bank[] = [
  { bin: "970422", code: "MB", name: "MB Bank (Quân đội)" },
  { bin: "970436", code: "VCB", name: "Vietcombank" },
  { bin: "970415", code: "ICB", name: "VietinBank" },
  { bin: "970418", code: "BIDV", name: "BIDV" },
  { bin: "970405", code: "VBA", name: "Agribank" },
  { bin: "970407", code: "TCB", name: "Techcombank" },
  { bin: "970416", code: "ACB", name: "ACB" },
  { bin: "970432", code: "VPB", name: "VPBank" },
  { bin: "970423", code: "TPB", name: "TPBank" },
  { bin: "970403", code: "STB", name: "Sacombank" },
  { bin: "970437", code: "HDB", name: "HDBank" },
  { bin: "970441", code: "VIB", name: "VIB" },
  { bin: "970443", code: "SHB", name: "SHB" },
  { bin: "970431", code: "EIB", name: "Eximbank" },
  { bin: "970426", code: "MSB", name: "MSB (Hàng Hải)" },
  { bin: "970448", code: "OCB", name: "OCB (Phương Đông)" },
  { bin: "970440", code: "SEAB", name: "SeABank" },
  { bin: "970449", code: "LPB", name: "LPBank (Lộc Phát)" },
  { bin: "970428", code: "NAB", name: "Nam A Bank" },
  { bin: "970409", code: "BAB", name: "Bac A Bank" },
  { bin: "970412", code: "PVCB", name: "PVcomBank" },
  { bin: "970425", code: "ABB", name: "ABBANK" },
  { bin: "970427", code: "VAB", name: "VietABank" },
  { bin: "970452", code: "KLB", name: "Kienlongbank" },
  { bin: "970419", code: "NCB", name: "NCB (Quốc Dân)" },
  { bin: "970438", code: "BVB", name: "BaoViet Bank" },
  { bin: "970433", code: "VIETBANK", name: "Vietbank" },
  { bin: "970429", code: "SCB", name: "SCB (Sài Gòn)" },
  { bin: "970400", code: "SGICB", name: "Saigonbank" },
  { bin: "970430", code: "PGB", name: "PGBank" },
  { bin: "970408", code: "GPB", name: "GPBank" },
  { bin: "546034", code: "CAKE", name: "CAKE by VPBank" },
  { bin: "963388", code: "TIMO", name: "Timo by Bản Việt" },
];

export function findBank(bin: string): Bank | undefined {
  return BANKS.find((bank) => bank.bin === bin);
}

/** Tên chủ tài khoản trên QR phải viết HOA, không dấu — giống cách app ngân hàng hiển thị. */
export function normalizeAccountName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Ảnh QR theo Quick Link của VietQR (img.vietqr.io): mọi app ngân hàng quét được,
 * tự điền sẵn số tài khoản, số tiền và nội dung chuyển khoản.
 */
export function vietQrImageUrl({
  bin,
  accountNumber,
  accountName,
  amount,
  content,
}: {
  bin: string;
  accountNumber: string;
  accountName?: string | null;
  amount?: number;
  content?: string | null;
}): string {
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(amount));
  if (content) params.set("addInfo", content);
  if (accountName) params.set("accountName", accountName);

  const query = params.toString();
  return `https://img.vietqr.io/image/${bin}-${encodeURIComponent(accountNumber)}-compact2.png${
    query ? `?${query}` : ""
  }`;
}
