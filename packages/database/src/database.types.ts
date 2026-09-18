export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line: string
          contact_id: string
          created_at: string
          district: string | null
          formatted_address: string | null
          geocoded_at: string | null
          id: string
          is_default: boolean
          latitude: number | null
          location_source: string | null
          longitude: number | null
          phone: string
          place_id: string | null
          province: string | null
          recipient_name: string
          updated_at: string
          ward: string | null
        }
        Insert: {
          address_line: string
          contact_id: string
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          phone: string
          place_id?: string | null
          province?: string | null
          recipient_name: string
          updated_at?: string
          ward?: string | null
        }
        Update: {
          address_line?: string
          contact_id?: string
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          phone?: string
          place_id?: string | null
          province?: string | null
          recipient_name?: string
          updated_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          detected_at: string
          id: string
          message: string
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          id?: string
          message: string
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          id?: string
          message?: string
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blockchain_events: {
        Row: {
          block_number: number | null
          chain_timestamp: string | null
          created_at: string
          event_data_hash: string
          event_payload: Json | null
          event_type: string
          id: string
          order_id: string
          performed_by: string | null
          previous_hash: string | null
          transaction_hash: string | null
          tx_status: string
        }
        Insert: {
          block_number?: number | null
          chain_timestamp?: string | null
          created_at?: string
          event_data_hash: string
          event_payload?: Json | null
          event_type: string
          id?: string
          order_id: string
          performed_by?: string | null
          previous_hash?: string | null
          transaction_hash?: string | null
          tx_status?: string
        }
        Update: {
          block_number?: number | null
          chain_timestamp?: string | null
          created_at?: string
          event_data_hash?: string
          event_payload?: Json | null
          event_type?: string
          id?: string
          order_id?: string
          performed_by?: string | null
          previous_hash?: string | null
          transaction_hash?: string | null
          tx_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "blockchain_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockchain_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_transactions: {
        Row: {
          amount: number
          collected_at: string | null
          collected_by: string | null
          id: string
          note: string | null
          order_id: string
          reconciled_at: string | null
          reconciled_by: string | null
          status: Database["public"]["Enums"]["cod_transaction_status"]
        }
        Insert: {
          amount: number
          collected_at?: string | null
          collected_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["cod_transaction_status"]
        }
        Update: {
          amount?: number
          collected_at?: string | null
          collected_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["cod_transaction_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cod_transactions_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          default_address_id: string | null
          email: string | null
          id: string
          name: string
          phone: string
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          default_address_id?: string | null
          email?: string | null
          id?: string
          name: string
          phone: string
          type: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          default_address_id?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_default_address_id_fkey"
            columns: ["default_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_locations: {
        Row: {
          accuracy_m: number | null
          courier_id: string
          created_at: string
          heading_deg: number | null
          id: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at: string
          shipment_leg_id: string
          speed_mps: number | null
        }
        Insert: {
          accuracy_m?: number | null
          courier_id: string
          created_at?: string
          heading_deg?: number | null
          id?: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at?: string
          shipment_leg_id: string
          speed_mps?: number | null
        }
        Update: {
          accuracy_m?: number | null
          courier_id?: string
          created_at?: string
          heading_deg?: number | null
          id?: string
          latitude?: number
          longitude?: number
          order_id?: string
          recorded_at?: string
          shipment_leg_id?: string
          speed_mps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_locations_shipment_leg_id_fkey"
            columns: ["shipment_leg_id"]
            isOneToOne: false
            referencedRelation: "shipment_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string
          assigned_by: string
          delivery_staff_id: string
          id: string
          is_return: boolean
          order_id: string
          received_at: string | null
          shipment_leg_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          delivery_staff_id: string
          id?: string
          is_return?: boolean
          order_id: string
          received_at?: string | null
          shipment_leg_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          delivery_staff_id?: string
          id?: string
          is_return?: boolean
          order_id?: string
          received_at?: string | null
          shipment_leg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_delivery_staff_id_fkey"
            columns: ["delivery_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_shipment_leg_id_fkey"
            columns: ["shipment_leg_id"]
            isOneToOne: false
            referencedRelation: "shipment_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          attempt_no: number
          attempt_time: string
          delivery_id: string
          id: string
          note: string | null
          reason_fail: string | null
          result: Database["public"]["Enums"]["delivery_attempt_result"]
        }
        Insert: {
          attempt_no?: number
          attempt_time?: string
          delivery_id: string
          id?: string
          note?: string | null
          reason_fail?: string | null
          result: Database["public"]["Enums"]["delivery_attempt_result"]
        }
        Update: {
          attempt_no?: number
          attempt_time?: string
          delivery_id?: string
          id?: string
          note?: string | null
          reason_fail?: string | null
          result?: Database["public"]["Enums"]["delivery_attempt_result"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          delivery_id: string
          event_time: string
          from_status_id: string | null
          id: string
          image_url: string | null
          location_lat: number | null
          location_lng: number | null
          note: string | null
          order_id: string
          performed_by: string
          status_id: string
        }
        Insert: {
          delivery_id: string
          event_time?: string
          from_status_id?: string | null
          id?: string
          image_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          note?: string | null
          order_id: string
          performed_by: string
          status_id: string
        }
        Update: {
          delivery_id?: string
          event_time?: string
          from_status_id?: string | null
          id?: string
          image_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          note?: string | null
          order_id?: string
          performed_by?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          order_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          declared_value: number | null
          height: number | null
          id: string
          item_name: string
          item_type: string | null
          length: number | null
          note: string | null
          order_id: string
          quantity: number
          weight: number | null
          width: number | null
        }
        Insert: {
          declared_value?: number | null
          height?: number | null
          id?: string
          item_name: string
          item_type?: string | null
          length?: number | null
          note?: string | null
          order_id: string
          quantity?: number
          weight?: number | null
          width?: number | null
        }
        Update: {
          declared_value?: number | null
          height?: number | null
          id?: string
          item_name?: string
          item_type?: string | null
          length?: number | null
          note?: string | null
          order_id?: string
          quantity?: number
          weight?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          code: string
          description: string | null
          id: string
          is_final: boolean
          name: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          is_final?: boolean
          name: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          is_final?: boolean
          name?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          cancel_reason: string | null
          cod_amount: number
          created_at: string
          created_by: string
          delivery_address_id: string
          delivery_warehouse_id: string | null
          expected_delivery_date: string | null
          id: string
          note: string | null
          pickup_address_id: string
          pickup_warehouse_id: string | null
          qr_code: string
          receiver_id: string
          sender_id: string
          service_type: string
          status_id: string
          total_fee: number
          tracking_code: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cod_amount?: number
          created_at?: string
          created_by: string
          delivery_address_id: string
          delivery_warehouse_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          note?: string | null
          pickup_address_id: string
          pickup_warehouse_id?: string | null
          qr_code: string
          receiver_id: string
          sender_id: string
          service_type?: string
          status_id: string
          total_fee?: number
          tracking_code: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cod_amount?: number
          created_at?: string
          created_by?: string
          delivery_address_id?: string
          delivery_warehouse_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          note?: string | null
          pickup_address_id?: string
          pickup_warehouse_id?: string | null
          qr_code?: string
          receiver_id?: string
          sender_id?: string
          service_type?: string
          status_id?: string
          total_fee?: number
          tracking_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_warehouse_id_fkey"
            columns: ["delivery_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_address_id_fkey"
            columns: ["pickup_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_warehouse_id_fkey"
            columns: ["pickup_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_events: {
        Row: {
          actual_weight_kg: number | null
          attempt_no: number
          event_time: string
          event_type: string
          id: string
          note: string | null
          order_id: string
          package_condition: string | null
          performed_by: string
          shipment_leg_id: string
          warehouse_id: string
        }
        Insert: {
          actual_weight_kg?: number | null
          attempt_no?: number
          event_time?: string
          event_type: string
          id?: string
          note?: string | null
          order_id: string
          package_condition?: string | null
          performed_by: string
          shipment_leg_id: string
          warehouse_id: string
        }
        Update: {
          actual_weight_kg?: number | null
          attempt_no?: number
          event_time?: string
          event_type?: string
          id?: string
          note?: string | null
          order_id?: string
          package_condition?: string | null
          performed_by?: string
          shipment_leg_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_events_shipment_leg_id_fkey"
            columns: ["shipment_leg_id"]
            isOneToOne: false
            referencedRelation: "shipment_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_events_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address_line: string
          capacity: number | null
          code: string
          created_at: string
          district: string | null
          geocoded_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          parent_warehouse_id: string | null
          place_id: string | null
          province: string
          region_code: string | null
          status: string
          updated_at: string
          ward: string | null
          warehouse_level: string
        }
        Insert: {
          address_line: string
          capacity?: number | null
          code: string
          created_at?: string
          district?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          parent_warehouse_id?: string | null
          place_id?: string | null
          province: string
          region_code?: string | null
          status?: string
          updated_at?: string
          ward?: string | null
          warehouse_level?: string
        }
        Update: {
          address_line?: string
          capacity?: number | null
          code?: string
          created_at?: string
          district?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          parent_warehouse_id?: string | null
          place_id?: string | null
          province?: string
          region_code?: string | null
          status?: string
          updated_at?: string
          ward?: string | null
          warehouse_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_parent_warehouse_id_fkey"
            columns: ["parent_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_legs: {
        Row: {
          attempt_no: number
          assigned_at: string | null
          assigned_by: string | null
          assigned_staff_id: string | null
          completed_at: string | null
          created_at: string
          from_warehouse_id: string | null
          id: string
          is_return: boolean
          leg_type: string
          note: string | null
          order_id: string
          responsibility_province: string | null
          sequence_no: number
          started_at: string | null
          status: string
          to_warehouse_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_no?: number
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string
          from_warehouse_id?: string | null
          id?: string
          is_return?: boolean
          leg_type: string
          note?: string | null
          order_id: string
          responsibility_province?: string | null
          sequence_no: number
          started_at?: string | null
          status?: string
          to_warehouse_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_no?: number
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string
          from_warehouse_id?: string | null
          id?: string
          is_return?: boolean
          leg_type?: string
          note?: string | null
          order_id?: string
          responsibility_province?: string | null
          sequence_no?: number
          started_at?: string | null
          status?: string
          to_warehouse_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_legs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_legs_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_legs_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_legs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_legs_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          password_hash: string
          phone: string | null
          province: string | null
          role_id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_login_at?: string | null
          password_hash: string
          phone?: string | null
          province?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_login_at?: string | null
          password_hash?: string
          phone?: string | null
          province?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      cod_transaction_status: "pending" | "collected" | "reconciled"
      contact_type: "sender" | "receiver" | "both"
      delivery_attempt_result: "success" | "failed"
      user_status: "active" | "inactive" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cod_transaction_status: ["pending", "collected", "reconciled"],
      contact_type: ["sender", "receiver", "both"],
      delivery_attempt_result: ["success", "failed"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
