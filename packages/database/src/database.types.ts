/**
 * Kieu du lieu Database khop voi supabase/migrations/00000000000001_init_schema.sql.
 *
 * Day la ban viet tay de package co the type-check ngay ma khong can mot
 * Supabase project that. Sau khi ban da `supabase link` va push migration
 * len project that, hay chay:
 *
 *   pnpm db:gen-types
 *
 * de GHI DE file nay bang ban sinh tu dong tu schema that (luon chinh xac
 * hon, dac biet voi cac quan he embedded-select).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ContactType = "sender" | "receiver";
export type DeliveryAttemptResult = "success" | "failed";
export type CodTransactionStatus = "pending" | "collected" | "reconciled";
export type UserStatus = "active" | "inactive" | "suspended";

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string;
          name: string;
          code: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          name: string;
          code: string;
          module: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          module: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string };
        Insert: { role_id: string; permission_id: string };
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          role_id: string;
          full_name: string;
          email: string;
          password_hash: string;
          phone: string | null;
          avatar: string | null;
          status: UserStatus;
          created_at: string;
          updated_at: string;
          last_login_at: string | null;
        };
        Insert: {
          id?: string;
          role_id: string;
          full_name: string;
          email: string;
          password_hash: string;
          phone?: string | null;
          avatar?: string | null;
          status?: UserStatus;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          user_id: string | null;
          type: ContactType;
          name: string;
          phone: string;
          default_address_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: ContactType;
          name: string;
          phone: string;
          default_address_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      addresses: {
        Row: {
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
        };
        Insert: {
          id?: string;
          contact_id: string;
          recipient_name: string;
          phone: string;
          address_line: string;
          ward?: string | null;
          district?: string | null;
          province?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["addresses"]["Insert"]>;
        Relationships: [];
      };
      order_statuses: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          is_final: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          is_final?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["order_statuses"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          tracking_code: string;
          qr_code: string;
          sender_id: string;
          receiver_id: string;
          pickup_address_id: string;
          delivery_address_id: string;
          service_type: string;
          cod_amount: number;
          total_fee: number;
          status_id: string;
          note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          cancel_reason: string | null;
        };
        Insert: {
          id?: string;
          tracking_code: string;
          qr_code: string;
          sender_id: string;
          receiver_id: string;
          pickup_address_id: string;
          delivery_address_id: string;
          service_type?: string;
          cod_amount?: number;
          total_fee?: number;
          status_id: string;
          note?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          cancel_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          item_name: string;
          item_type: string | null;
          quantity: number;
          weight: number | null;
          length: number | null;
          width: number | null;
          height: number | null;
          declared_value: number | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          item_name: string;
          item_type?: string | null;
          quantity?: number;
          weight?: number | null;
          length?: number | null;
          width?: number | null;
          height?: number | null;
          declared_value?: number | null;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
        Relationships: [];
      };
      deliveries: {
        Row: {
          id: string;
          order_id: string;
          delivery_staff_id: string;
          assigned_by: string;
          assigned_at: string;
          received_at: string | null;
          is_return: boolean;
        };
        Insert: {
          id?: string;
          order_id: string;
          delivery_staff_id: string;
          assigned_by: string;
          assigned_at?: string;
          received_at?: string | null;
          is_return?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["deliveries"]["Insert"]>;
        Relationships: [];
      };
      delivery_events: {
        Row: {
          id: string;
          delivery_id: string;
          order_id: string;
          status_id: string;
          performed_by: string;
          event_time: string;
          location_lat: number | null;
          location_lng: number | null;
          note: string | null;
          image_url: string | null;
        };
        Insert: {
          id?: string;
          delivery_id: string;
          order_id: string;
          status_id: string;
          performed_by: string;
          event_time?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          note?: string | null;
          image_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_events"]["Insert"]>;
        Relationships: [];
      };
      delivery_attempts: {
        Row: {
          id: string;
          delivery_id: string;
          attempt_no: number;
          attempt_time: string;
          result: DeliveryAttemptResult;
          reason_fail: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          delivery_id: string;
          attempt_no?: number;
          attempt_time?: string;
          result: DeliveryAttemptResult;
          reason_fail?: string | null;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_attempts"]["Insert"]>;
        Relationships: [];
      };
      cod_transactions: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          collected_by: string | null;
          collected_at: string | null;
          status: CodTransactionStatus;
          reconciled_at: string | null;
          reconciled_by: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          amount: number;
          collected_by?: string | null;
          collected_at?: string | null;
          status?: CodTransactionStatus;
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cod_transactions"]["Insert"]>;
        Relationships: [];
      };
      blockchain_events: {
        Row: {
          id: string;
          order_id: string;
          event_type: string;
          event_data_hash: string;
          previous_hash: string | null;
          transaction_hash: string | null;
          block_number: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_type: string;
          event_data_hash: string;
          previous_hash?: string | null;
          transaction_hash?: string | null;
          block_number?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["blockchain_events"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          order_id: string | null;
          type: string;
          title: string;
          message: string;
          is_read: boolean;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          order_id?: string | null;
          type: string;
          title: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
          read_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          old_data: Json | null;
          new_data: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      system_settings: {
        Row: {
          id: string;
          key: string;
          value: string | null;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value?: string | null;
          description?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["system_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      contact_type: ContactType;
      delivery_attempt_result: DeliveryAttemptResult;
      cod_transaction_status: CodTransactionStatus;
      user_status: UserStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
