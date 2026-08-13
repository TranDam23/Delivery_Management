import type { ContactType } from "../enums";

export interface Contact {
  id: string;
  user_id: string | null;
  type: ContactType;
  name: string;
  phone: string;
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
