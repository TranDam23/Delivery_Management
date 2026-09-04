import { ContactType } from "../enums";

export interface Contact {
  id: string;
  user_id: string | null;
  type: ContactType;
  name: string;
  phone: string;
  email: string | null;
  default_address_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  contact_id: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Lien he kem dia chi mac dinh — dung cho so dia chi va man chi tiet lien he. */
export interface ContactWithDefaultAddress extends Contact {
  default_address: Address | null;
}

/**
 * Du lieu tao lien he moi. Dia chi KHONG nam trong payload nay: mot lien he
 * co nhieu dia chi, duoc them rieng qua chuc nang "Them dia chi".
 */
export interface CreateContactInput {
  type: ContactType;
  name: string;
  phone: string;
  email?: string | null;
}

export type UpdateContactInput = Partial<CreateContactInput>;

/**
 * Lien he vai tro 'both' dong duoc ca hai dau cua don hang. Dung hai ham nay
 * thay vi so sanh truc tiep `type === 'sender'`, neu khong lien he "Ca hai"
 * se bien mat khoi o chon nguoi gui/nguoi nhan khi tao don.
 */
export function canBeSender(type: ContactType): boolean {
  return type === ContactType.SENDER || type === ContactType.BOTH;
}

export function canBeReceiver(type: ContactType): boolean {
  return type === ContactType.RECEIVER || type === ContactType.BOTH;
}

/** Nhan hien thi tieng Viet, dung chung cho web va app de khong lech chu. */
export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  [ContactType.SENDER]: "Người gửi",
  [ContactType.RECEIVER]: "Người nhận",
  [ContactType.BOTH]: "Cả hai",
};
