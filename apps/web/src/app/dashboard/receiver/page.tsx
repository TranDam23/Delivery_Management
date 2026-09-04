import { redirect } from "next/navigation";

/** Route cu de tuong thich lien ket cu; tai khoan khach hang dung /customer. */
export default function ReceiverDashboardPage(): never {
  redirect("/customer");
}
