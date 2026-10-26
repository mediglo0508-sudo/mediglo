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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          email: string | null
          gender: string | null
          id: string
          integration_key: string | null
          notes: string | null
          phone: string | null
          service_inquiry: string | null
          status: string
          updated_at: string
          wallet_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          email?: string | null
          gender?: string | null
          id?: string
          integration_key?: string | null
          notes?: string | null
          phone?: string | null
          service_inquiry?: string | null
          status?: string
          updated_at?: string
          wallet_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          email?: string | null
          gender?: string | null
          id?: string
          integration_key?: string | null
          notes?: string | null
          phone?: string | null
          service_inquiry?: string | null
          status?: string
          updated_at?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "service_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      bak_july_excel_dates: {
        Row: {
          customer_name: string | null
          id: string | null
          invoice_no: string | null
          old_date: string | null
          snapshot_at: string | null
        }
        Insert: {
          customer_name?: string | null
          id?: string | null
          invoice_no?: string | null
          old_date?: string | null
          snapshot_at?: string | null
        }
        Update: {
          customer_name?: string | null
          id?: string | null
          invoice_no?: string | null
          old_date?: string | null
          snapshot_at?: string | null
        }
        Relationships: []
      }
      bank_statements: {
        Row: {
          bank_name: string | null
          created_at: string
          file_name: string
          id: string
          row_count: number
          uploaded_by: string | null
        }
        Insert: {
          bank_name?: string | null
          created_at?: string
          file_name: string
          id?: string
          row_count?: number
          uploaded_by?: string | null
        }
        Update: {
          bank_name?: string | null
          created_at?: string
          file_name?: string
          id?: string
          row_count?: number
          uploaded_by?: string | null
        }
        Relationships: []
      }
      billing_audit_log: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          amount: number | null
          created_at: string
          customer_name: string | null
          details: Json | null
          entry_point: string | null
          event_type: string
          id: string
          invoice_id: string | null
          invoice_no: string | null
          match_level: string | null
          match_reasons: Json | null
          match_score: number | null
          matched_invoice_id: string | null
          matched_invoice_no: string | null
          phone: string | null
          reason: string | null
          target_user_id: string | null
          target_user_name: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          amount?: number | null
          created_at?: string
          customer_name?: string | null
          details?: Json | null
          entry_point?: string | null
          event_type: string
          id?: string
          invoice_id?: string | null
          invoice_no?: string | null
          match_level?: string | null
          match_reasons?: Json | null
          match_score?: number | null
          matched_invoice_id?: string | null
          matched_invoice_no?: string | null
          phone?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          amount?: number | null
          created_at?: string
          customer_name?: string | null
          details?: Json | null
          entry_point?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          invoice_no?: string | null
          match_level?: string | null
          match_reasons?: Json | null
          match_score?: number | null
          matched_invoice_id?: string | null
          matched_invoice_no?: string | null
          phone?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
        }
        Relationships: []
      }
      billing_permissions: {
        Row: {
          billing_locked: boolean
          can_override_duplicate: boolean
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          override_granted_at: string | null
          override_granted_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_locked?: boolean
          can_override_duplicate?: boolean
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          override_granted_at?: string | null
          override_granted_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_locked?: boolean
          can_override_duplicate?: boolean
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          override_granted_at?: string | null
          override_granted_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clinic_rooms: {
        Row: {
          assigned_staff_id: string | null
          busy_till: string | null
          current_patient_id: string | null
          current_patient_name: string | null
          current_treatment: string | null
          id: number
          last_updated: string
          room_name: string
          status: string
        }
        Insert: {
          assigned_staff_id?: string | null
          busy_till?: string | null
          current_patient_id?: string | null
          current_patient_name?: string | null
          current_treatment?: string | null
          id?: number
          last_updated?: string
          room_name: string
          status?: string
        }
        Update: {
          assigned_staff_id?: string | null
          busy_till?: string | null
          current_patient_id?: string | null
          current_patient_name?: string | null
          current_treatment?: string | null
          id?: number
          last_updated?: string
          room_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_rooms_current_patient_id_fkey"
            columns: ["current_patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_records: {
        Row: {
          client_interested: boolean | null
          consultation_fee_only: boolean
          created_at: string
          created_by: string | null
          id: string
          investigations: string | null
          patient_id: string | null
          prescription_notes: string | null
          record_type: string | null
          suggested_medicines: Json
          suggested_services: Json
          updated_at: string
        }
        Insert: {
          client_interested?: boolean | null
          consultation_fee_only?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          investigations?: string | null
          patient_id?: string | null
          prescription_notes?: string | null
          record_type?: string | null
          suggested_medicines?: Json
          suggested_services?: Json
          updated_at?: string
        }
        Update: {
          client_interested?: boolean | null
          consultation_fee_only?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          investigations?: string | null
          patient_id?: string | null
          prescription_notes?: string | null
          record_type?: string | null
          suggested_medicines?: Json
          suggested_services?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_logs: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          patient_name: string | null
          qty_used: number
          staff: string | null
          status: string
          unit: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          patient_name?: string | null
          qty_used?: number
          staff?: string | null
          status?: string
          unit?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          patient_name?: string | null
          qty_used?: number
          staff?: string | null
          status?: string
          unit?: string | null
          visit_id?: string | null
        }
        Relationships: []
      }
      cos_appointments: {
        Row: {
          appointment_date: string
          appointment_source: string
          appointment_source_metadata: Json
          auto_generated: boolean | null
          booked_by: string | null
          branch_id: string
          checked_out_at: string | null
          color_assigned_at: string | null
          color_assigned_by: string | null
          color_hex: string | null
          color_tag: string | null
          consultation_route: string | null
          counsellor_id: string | null
          created_at: string
          discussion_notes: string | null
          doctor_id: string
          end_time: string
          followup_details: string | null
          id: string
          important_note: string | null
          lead_source: string | null
          offer_applied_id: string | null
          patient_concern: string | null
          patient_id: string
          room_id: string | null
          service_id: string | null
          start_time: string
          status: string | null
          therapist_id: string | null
          updated_at: string
          wallet_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_source?: string
          appointment_source_metadata?: Json
          auto_generated?: boolean | null
          booked_by?: string | null
          branch_id: string
          checked_out_at?: string | null
          color_assigned_at?: string | null
          color_assigned_by?: string | null
          color_hex?: string | null
          color_tag?: string | null
          consultation_route?: string | null
          counsellor_id?: string | null
          created_at?: string
          discussion_notes?: string | null
          doctor_id: string
          end_time: string
          followup_details?: string | null
          id?: string
          important_note?: string | null
          lead_source?: string | null
          offer_applied_id?: string | null
          patient_concern?: string | null
          patient_id: string
          room_id?: string | null
          service_id?: string | null
          start_time: string
          status?: string | null
          therapist_id?: string | null
          updated_at?: string
          wallet_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_source?: string
          appointment_source_metadata?: Json
          auto_generated?: boolean | null
          booked_by?: string | null
          branch_id?: string
          checked_out_at?: string | null
          color_assigned_at?: string | null
          color_assigned_by?: string | null
          color_hex?: string | null
          color_tag?: string | null
          consultation_route?: string | null
          counsellor_id?: string | null
          created_at?: string
          discussion_notes?: string | null
          doctor_id?: string
          end_time?: string
          followup_details?: string | null
          id?: string
          important_note?: string | null
          lead_source?: string | null
          offer_applied_id?: string | null
          patient_concern?: string | null
          patient_id?: string
          room_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: string | null
          therapist_id?: string | null
          updated_at?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_appointments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "service_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_backup_schedule: {
        Row: {
          created_at: string
          frequency: string
          id: string
          last_run_at: string | null
          recipient_email: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          frequency?: string
          id?: string
          last_run_at?: string | null
          recipient_email?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          last_run_at?: string | null
          recipient_email?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cos_branches: {
        Row: {
          code: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
        }
        Relationships: []
      }
      cos_chat_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      cos_follow_up_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          follow_up_id: string
          id: string
          next_followup_at: string | null
          note: string
          outcome: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          follow_up_id: string
          id?: string
          next_followup_at?: string | null
          note: string
          outcome?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          follow_up_id?: string
          id?: string
          next_followup_at?: string | null
          note?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_follow_up_notes_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "cos_follow_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_follow_ups: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          bucket: string | null
          counselor_notes: string | null
          created_at: string
          doctor_notes: string | null
          expected_visit_date: string | null
          gap_stage: number | null
          id: string
          kind: string
          last_contacted_at: string | null
          next_followup_at: string | null
          notes: string | null
          patient_id: string | null
          patient_name: string
          patient_phone: string | null
          recommended_services: Json | null
          source_key: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          bucket?: string | null
          counselor_notes?: string | null
          created_at?: string
          doctor_notes?: string | null
          expected_visit_date?: string | null
          gap_stage?: number | null
          id?: string
          kind?: string
          last_contacted_at?: string | null
          next_followup_at?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name: string
          patient_phone?: string | null
          recommended_services?: Json | null
          source_key?: string | null
          status?: string
          trigger_reason: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          bucket?: string | null
          counselor_notes?: string | null
          created_at?: string
          doctor_notes?: string | null
          expected_visit_date?: string | null
          gap_stage?: number | null
          id?: string
          kind?: string
          last_contacted_at?: string | null
          next_followup_at?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name?: string
          patient_phone?: string | null
          recommended_services?: Json | null
          source_key?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      cos_notifications_hub: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          notification_type: string
          target_role: string
          title: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          notification_type: string
          target_role: string
          title: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          notification_type?: string
          target_role?: string
          title?: string
        }
        Relationships: []
      }
      cos_room_assets: {
        Row: {
          assigned_treatments: string[] | null
          branch_id: string
          created_at: string
          equipment_status: string | null
          id: string
          room_identifier: string
        }
        Insert: {
          assigned_treatments?: string[] | null
          branch_id: string
          created_at?: string
          equipment_status?: string | null
          id?: string
          room_identifier: string
        }
        Update: {
          assigned_treatments?: string[] | null
          branch_id?: string
          created_at?: string
          equipment_status?: string | null
          id?: string
          room_identifier?: string
        }
        Relationships: []
      }
      cos_scheduled_sessions: {
        Row: {
          created_at: string
          gap_days_applied: number
          id: string
          package_id: string | null
          patient_id: string
          scheduled_date: string
          session_number: number
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gap_days_applied: number
          id?: string
          package_id?: string | null
          patient_id: string
          scheduled_date: string
          session_number: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gap_days_applied?: number
          id?: string
          package_id?: string | null
          patient_id?: string
          scheduled_date?: string
          session_number?: number
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_scheduled_sessions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "cos_treatment_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_service_gap_rules: {
        Row: {
          custom_gap_days: number
          default_gap_days: number | null
          id: string
          service_id: string
          service_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom_gap_days: number
          default_gap_days?: number | null
          id?: string
          service_id: string
          service_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom_gap_days?: number
          default_gap_days?: number | null
          id?: string
          service_id?: string
          service_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cos_treatment_packages: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          outstanding_balance: number | null
          package_name: string
          patient_id: string
          sessions_completed: number | null
          total_sessions: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          outstanding_balance?: number | null
          package_name: string
          patient_id: string
          sessions_completed?: number | null
          total_sessions: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          outstanding_balance?: number | null
          package_name?: string
          patient_id?: string
          sessions_completed?: number | null
          total_sessions?: number
        }
        Relationships: []
      }
      counselor_quotations: {
        Row: {
          cgst: number
          counselor_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          discount_percent: number
          discount_reason: string | null
          encounter_id: string | null
          expires_at: string | null
          finalized_at: string | null
          gst_5_percent: number
          has_products_only: boolean
          id: string
          items_json: Json
          net_total: number
          prescription_id: string | null
          product_order_id: string | null
          product_pickup_date: string | null
          quotation_number: string | null
          recommendation_id: string | null
          sgst: number
          status: string
          subtotal: number
          transaction_type: string
          updated_at: string
          validity_days: number
          visit_id: string | null
        }
        Insert: {
          cgst?: number
          counselor_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_reason?: string | null
          encounter_id?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          gst_5_percent?: number
          has_products_only?: boolean
          id?: string
          items_json?: Json
          net_total?: number
          prescription_id?: string | null
          product_order_id?: string | null
          product_pickup_date?: string | null
          quotation_number?: string | null
          recommendation_id?: string | null
          sgst?: number
          status?: string
          subtotal?: number
          transaction_type?: string
          updated_at?: string
          validity_days?: number
          visit_id?: string | null
        }
        Update: {
          cgst?: number
          counselor_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_reason?: string | null
          encounter_id?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          gst_5_percent?: number
          has_products_only?: boolean
          id?: string
          items_json?: Json
          net_total?: number
          prescription_id?: string | null
          product_order_id?: string | null
          product_pickup_date?: string | null
          quotation_number?: string | null
          recommendation_id?: string | null
          sgst?: number
          status?: string
          subtotal?: number
          transaction_type?: string
          updated_at?: string
          validity_days?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_quotations_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_quotations_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "doctor_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_quotations_product_order_id_fkey"
            columns: ["product_order_id"]
            isOneToOne: false
            referencedRelation: "product_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_quotations_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "treatment_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_quotations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          age: number | null
          city: string | null
          client_type: string | null
          created_at: string
          customer_code: string | null
          email: string | null
          gender: string | null
          id: string
          internal_notes: string | null
          name: string
          outstanding_balance: number
          phone: string | null
          state_code: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          city?: string | null
          client_type?: string | null
          created_at?: string
          customer_code?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          internal_notes?: string | null
          name: string
          outstanding_balance?: number
          phone?: string | null
          state_code?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          city?: string | null
          client_type?: string | null
          created_at?: string
          customer_code?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          internal_notes?: string | null
          name?: string
          outstanding_balance?: number
          phone?: string | null
          state_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_prescription_items: {
        Row: {
          created_at: string
          id: string
          inventory_id: string | null
          item_type: string
          name: string
          notes: string | null
          prescription_id: string
          quantity: number
          service_id: string | null
          sessions: number
          sort_order: number
          suggested_price: number
          urgency: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          name: string
          notes?: string | null
          prescription_id: string
          quantity?: number
          service_id?: string | null
          sessions?: number
          sort_order?: number
          suggested_price?: number
          urgency?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          name?: string
          notes?: string | null
          prescription_id?: string
          quantity?: number
          service_id?: string | null
          sessions?: number
          sort_order?: number
          suggested_price?: number
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_prescription_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "doctor_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_prescription_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services_master"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_prescriptions: {
        Row: {
          clinical_notes: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          diagnosis: string | null
          doctor_id: string
          encounter_id: string | null
          finalized_at: string | null
          id: string
          instructions: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id?: string
          encounter_id?: string | null
          finalized_at?: string | null
          id?: string
          instructions?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id?: string
          encounter_id?: string | null
          finalized_at?: string | null
          id?: string
          instructions?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_prescriptions_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_prescriptions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          appointment_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          encounter_type: string
          id: string
          notes: string | null
          started_at: string | null
          started_by: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          encounter_type?: string
          id?: string
          notes?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          encounter_type?: string
          id?: string
          notes?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "cos_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_stage: {
        Row: {
          flag: string | null
          gross: number | null
          id: number
          kind: string | null
          lines: Json | null
          match_invoice: string | null
          match_kind: string | null
          mode_raw: string | null
          name: string | null
          note: string | null
          paid: number | null
          pending: number | null
          phone: string | null
          service_text: string | null
          sheet: string | null
          srcrow: number | null
          tenders: Json | null
          txn_date: string | null
        }
        Insert: {
          flag?: string | null
          gross?: number | null
          id?: number
          kind?: string | null
          lines?: Json | null
          match_invoice?: string | null
          match_kind?: string | null
          mode_raw?: string | null
          name?: string | null
          note?: string | null
          paid?: number | null
          pending?: number | null
          phone?: string | null
          service_text?: string | null
          sheet?: string | null
          srcrow?: number | null
          tenders?: Json | null
          txn_date?: string | null
        }
        Update: {
          flag?: string | null
          gross?: number | null
          id?: number
          kind?: string | null
          lines?: Json | null
          match_invoice?: string | null
          match_kind?: string | null
          mode_raw?: string | null
          name?: string | null
          note?: string | null
          paid?: number | null
          pending?: number | null
          phone?: string | null
          service_text?: string | null
          sheet?: string | null
          srcrow?: number | null
          tenders?: Json | null
          txn_date?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          paid_to: string | null
          payment_mode: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          paid_to?: string | null
          payment_mode?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          paid_to?: string | null
          payment_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_review_queue: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          raw_payload: Json
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          raw_payload: Json
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          raw_payload?: Json
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      integration_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
        }
        Relationships: []
      }
      integration_outbox_dead_letter: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          outbox_id: string | null
          payload: Json
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          last_error?: string | null
          outbox_id?: string | null
          payload?: Json
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          outbox_id?: string | null
          payload?: Json
        }
        Relationships: []
      }
      inventory: {
        Row: {
          active: boolean
          barcode: string | null
          batch_no: string | null
          brand: string | null
          category: string
          company: string | null
          created_at: string
          default_supplier_id: string | null
          expiry_date: string | null
          id: string
          name: string
          rate: number
          sku: string | null
          stock: number
          sub_category: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          batch_no?: string | null
          brand?: string | null
          category?: string
          company?: string | null
          created_at?: string
          default_supplier_id?: string | null
          expiry_date?: string | null
          id?: string
          name: string
          rate?: number
          sku?: string | null
          stock?: number
          sub_category?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          batch_no?: string | null
          brand?: string | null
          category?: string
          company?: string | null
          created_at?: string
          default_supplier_id?: string | null
          expiry_date?: string | null
          id?: string
          name?: string
          rate?: number
          sku?: string | null
          stock?: number
          sub_category?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "inventory_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          active: boolean
          batch_no: string
          created_at: string
          expiry_date: string | null
          id: string
          inventory_id: string
          mrp: number
          purchase_price: number
          quantity: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_no: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_id: string
          mrp?: number
          purchase_price?: number
          quantity?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_no?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_id?: string
          mrp?: number
          purchase_price?: number
          quantity?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inventory_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_brands: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_category: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_category?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_category?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          active: boolean
          batch_no: string | null
          brand: string | null
          category: string
          contact: string | null
          cost_price: number | null
          created_at: string
          disc: number | null
          expiry_date: string | null
          gst_rate: number
          hsn_code: string | null
          id: string
          kind: string
          linked_service_id: string | null
          name: string
          sale_price: number
          sku: string | null
          stock_category: string
          stock_qty: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          active?: boolean
          batch_no?: string | null
          brand?: string | null
          category?: string
          contact?: string | null
          cost_price?: number | null
          created_at?: string
          disc?: number | null
          expiry_date?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          kind?: string
          linked_service_id?: string | null
          name: string
          sale_price?: number
          sku?: string | null
          stock_category?: string
          stock_qty?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          active?: boolean
          batch_no?: string | null
          brand?: string | null
          category?: string
          contact?: string | null
          cost_price?: number | null
          created_at?: string
          disc?: number | null
          expiry_date?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          kind?: string
          linked_service_id?: string | null
          name?: string
          sale_price?: number
          sku?: string | null
          stock_category?: string
          stock_qty?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_linked_service_id_fkey"
            columns: ["linked_service_id"]
            isOneToOne: false
            referencedRelation: "services_master"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          import_id: string | null
          inventory_id: string
          invoice_id: string | null
          invoice_line_id: string | null
          movement_type: string
          new_stock: number
          note: string | null
          previous_stock: number
          quantity_change: number
          reverses_ledger_id: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          import_id?: string | null
          inventory_id: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          movement_type: string
          new_stock?: number
          note?: string | null
          previous_stock?: number
          quantity_change: number
          reverses_ledger_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          import_id?: string | null
          inventory_id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          movement_type?: string
          new_stock?: number
          note?: string | null
          previous_stock?: number
          quantity_change?: number
          reverses_ledger_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "inventory_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_suppliers: {
        Row: {
          created_at: string
          gstin: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gstin?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gstin?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          base_amount: number
          cgst: number
          created_at: string
          description: string
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          inventory_id: string | null
          invoice_id: string
          is_complimentary: boolean
          item_category: string
          line_status: string
          line_total: number
          package_id: string | null
          qty: number
          round_off: number
          sac_code: string | null
          session_label: string | null
          sgst: number
          unit_price: number
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          base_amount?: number
          cgst?: number
          created_at?: string
          description: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          inventory_id?: string | null
          invoice_id: string
          is_complimentary?: boolean
          item_category?: string
          line_status?: string
          line_total?: number
          package_id?: string | null
          qty?: number
          round_off?: number
          sac_code?: string | null
          session_label?: string | null
          sgst?: number
          unit_price?: number
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          base_amount?: number
          cgst?: number
          created_at?: string
          description?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          inventory_id?: string | null
          invoice_id?: string
          is_complimentary?: boolean
          item_category?: string
          line_status?: string
          line_total?: number
          package_id?: string | null
          qty?: number
          round_off?: number
          sac_code?: string | null
          session_label?: string | null
          sgst?: number
          unit_price?: number
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "treatment_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines_backup_batch_a: {
        Row: {
          base_amount: number | null
          cgst: number | null
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          id: string | null
          invoice_id: string | null
          is_complimentary: boolean | null
          item_category: string | null
          line_total: number | null
          package_id: string | null
          qty: number | null
          round_off: number | null
          sac_code: string | null
          session_label: string | null
          sgst: number | null
          unit_price: number | null
        }
        Insert: {
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string | null
          invoice_id?: string | null
          is_complimentary?: boolean | null
          item_category?: string | null
          line_total?: number | null
          package_id?: string | null
          qty?: number | null
          round_off?: number | null
          sac_code?: string | null
          session_label?: string | null
          sgst?: number | null
          unit_price?: number | null
        }
        Update: {
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string | null
          invoice_id?: string | null
          is_complimentary?: boolean | null
          item_category?: string | null
          line_total?: number | null
          package_id?: string | null
          qty?: number | null
          round_off?: number | null
          sac_code?: string | null
          session_label?: string | null
          sgst?: number | null
          unit_price?: number | null
        }
        Relationships: []
      }
      invoice_series: {
        Row: {
          fy_label: string
          last_no: number
        }
        Insert: {
          fy_label: string
          last_no?: number
        }
        Update: {
          fy_label?: string
          last_no?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          assigned_staff: string | null
          base_amount: number
          cgst: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          dispensed_at: string | null
          dispensed_by: string | null
          duplicate_ack: string | null
          duplicate_ack_reason: string | null
          encounter_id: string | null
          gross_total: number
          id: string
          invoice_date: string
          invoice_no: string | null
          invoice_type: string | null
          paid_amount: number
          payment_mode: string
          pending_balance: number
          prescription_id: string | null
          product_order_id: string | null
          quotation_id: string | null
          recommendation_id: string | null
          replaced_by: string | null
          revised_from: string | null
          round_off: number
          sgst: number
          source: string
          state_code: string
          tax_mode: Database["public"]["Enums"]["tax_mode"]
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          assigned_staff?: string | null
          base_amount?: number
          cgst?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          dispensed_at?: string | null
          dispensed_by?: string | null
          duplicate_ack?: string | null
          duplicate_ack_reason?: string | null
          encounter_id?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          invoice_type?: string | null
          paid_amount?: number
          payment_mode?: string
          pending_balance?: number
          prescription_id?: string | null
          product_order_id?: string | null
          quotation_id?: string | null
          recommendation_id?: string | null
          replaced_by?: string | null
          revised_from?: string | null
          round_off?: number
          sgst?: number
          source?: string
          state_code?: string
          tax_mode?: Database["public"]["Enums"]["tax_mode"]
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          assigned_staff?: string | null
          base_amount?: number
          cgst?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          dispensed_at?: string | null
          dispensed_by?: string | null
          duplicate_ack?: string | null
          duplicate_ack_reason?: string | null
          encounter_id?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          invoice_type?: string | null
          paid_amount?: number
          payment_mode?: string
          pending_balance?: number
          prescription_id?: string | null
          product_order_id?: string | null
          quotation_id?: string | null
          recommendation_id?: string | null
          replaced_by?: string | null
          revised_from?: string | null
          round_off?: number
          sgst?: number
          source?: string
          state_code?: string
          tax_mode?: Database["public"]["Enums"]["tax_mode"]
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "doctor_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_product_order_id_fkey"
            columns: ["product_order_id"]
            isOneToOne: false
            referencedRelation: "product_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "counselor_quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "treatment_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_backup_batch_a: {
        Row: {
          assigned_staff: string | null
          base_amount: number | null
          cgst: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount_amount: number | null
          gross_total: number | null
          id: string | null
          invoice_date: string | null
          invoice_no: string | null
          paid_amount: number | null
          payment_mode: string | null
          pending_balance: number | null
          replaced_by: string | null
          revised_from: string | null
          round_off: number | null
          sgst: number | null
          source: string | null
          state_code: string | null
          tax_mode: Database["public"]["Enums"]["tax_mode"] | null
          updated_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          assigned_staff?: string | null
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          gross_total?: number | null
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          paid_amount?: number | null
          payment_mode?: string | null
          pending_balance?: number | null
          replaced_by?: string | null
          revised_from?: string | null
          round_off?: number | null
          sgst?: number | null
          source?: string | null
          state_code?: string | null
          tax_mode?: Database["public"]["Enums"]["tax_mode"] | null
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          assigned_staff?: string | null
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          gross_total?: number | null
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          paid_amount?: number | null
          payment_mode?: string | null
          pending_balance?: number | null
          replaced_by?: string | null
          revised_from?: string | null
          round_off?: number | null
          sgst?: number | null
          source?: string | null
          state_code?: string | null
          tax_mode?: Database["public"]["Enums"]["tax_mode"] | null
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          area_of_interest: string
          created_at: string
          created_by: string | null
          custom_interest_notes: string | null
          entry_date: string | null
          gender: string | null
          id: string
          name: string
          phone: string | null
          selected_services: Json
          status: string
          updated_at: string
        }
        Insert: {
          area_of_interest?: string
          created_at?: string
          created_by?: string | null
          custom_interest_notes?: string | null
          entry_date?: string | null
          gender?: string | null
          id?: string
          name: string
          phone?: string | null
          selected_services?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          area_of_interest?: string
          created_at?: string
          created_by?: string | null
          custom_interest_notes?: string | null
          entry_date?: string | null
          gender?: string | null
          id?: string
          name?: string
          phone?: string | null
          selected_services?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_access_log: {
        Row: {
          client_id: string | null
          created_at: string
          endpoint: string
          error: string | null
          id: string
          ip: string | null
          ok: boolean
          scopes: string[] | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          endpoint: string
          error?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          scopes?: string[] | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          endpoint?: string
          error?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          scopes?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          scopes: string[]
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          redirect_uri: string
          scopes?: string[]
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          active: boolean
          allowed_scopes: string[]
          client_id: string
          client_secret_hash: string
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          name: string
          redirect_uris: string[]
        }
        Insert: {
          active?: boolean
          allowed_scopes?: string[]
          client_id: string
          client_secret_hash: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          redirect_uris?: string[]
        }
        Update: {
          active?: boolean
          allowed_scopes?: string[]
          client_id?: string
          client_secret_hash?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          redirect_uris?: string[]
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      oauth_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      oauth_refresh_tokens: {
        Row: {
          chain_id: string
          client_id: string
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          rotated_from: string | null
          scopes: string[]
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          chain_id: string
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          chain_id?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_rotated_from_fkey"
            columns: ["rotated_from"]
            isOneToOne: false
            referencedRelation: "oauth_refresh_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_visits: {
        Row: {
          area_of_interest: string | null
          assigned_staff: string | null
          bill_items: Json
          bill_kind: string | null
          busy_till: string | null
          counselor_notes: string | null
          counselor_slot: string | null
          created_at: string
          customer_name: string
          discount_pct: number | null
          doctor_notes: string | null
          gender: string | null
          id: string
          lead_id: string | null
          package_price: number | null
          package_status: string | null
          payment_mode: string | null
          phone: string | null
          prescription: string | null
          room: string | null
          scheduled_for: string | null
          scheduled_time: string | null
          seen_doctor: boolean
          status: string
          total_sessions: number | null
          treatment_duration_sec: number | null
          treatment_ended_at: string | null
          treatment_started_at: string | null
          updated_at: string
        }
        Insert: {
          area_of_interest?: string | null
          assigned_staff?: string | null
          bill_items?: Json
          bill_kind?: string | null
          busy_till?: string | null
          counselor_notes?: string | null
          counselor_slot?: string | null
          created_at?: string
          customer_name: string
          discount_pct?: number | null
          doctor_notes?: string | null
          gender?: string | null
          id?: string
          lead_id?: string | null
          package_price?: number | null
          package_status?: string | null
          payment_mode?: string | null
          phone?: string | null
          prescription?: string | null
          room?: string | null
          scheduled_for?: string | null
          scheduled_time?: string | null
          seen_doctor?: boolean
          status?: string
          total_sessions?: number | null
          treatment_duration_sec?: number | null
          treatment_ended_at?: string | null
          treatment_started_at?: string | null
          updated_at?: string
        }
        Update: {
          area_of_interest?: string | null
          assigned_staff?: string | null
          bill_items?: Json
          bill_kind?: string | null
          busy_till?: string | null
          counselor_notes?: string | null
          counselor_slot?: string | null
          created_at?: string
          customer_name?: string
          discount_pct?: number | null
          doctor_notes?: string | null
          gender?: string | null
          id?: string
          lead_id?: string | null
          package_price?: number | null
          package_status?: string | null
          payment_mode?: string | null
          phone?: string | null
          prescription?: string | null
          room?: string | null
          scheduled_for?: string | null
          scheduled_time?: string | null
          seen_doctor?: boolean
          status?: string
          total_sessions?: number | null
          treatment_duration_sec?: number | null
          treatment_ended_at?: string | null
          treatment_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacist_order_items: {
        Row: {
          batch_no: string | null
          created_at: string
          expiry_date: string | null
          id: string
          name: string
          notes: string | null
          order_id: string
          product_id: string | null
          quantity_dispensed: number | null
          quantity_requested: number
          quantity_returned: number
          status: string
          total_amount: number
          unit_price: number
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity_dispensed?: number | null
          quantity_requested: number
          quantity_returned?: number
          status?: string
          total_amount?: number
          unit_price?: number
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity_dispensed?: number | null
          quantity_requested?: number
          quantity_returned?: number
          status?: string
          total_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pharmacist_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "product_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacist_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacist_permissions: {
        Row: {
          active: boolean
          can_adjust_inventory: boolean
          can_approve_discounts: boolean
          can_modify_product_prices: boolean
          can_process_returns: boolean
          can_view_treatment_pricing: boolean
          can_write_off_damaged: boolean
          created_at: string
          id: string
          is_senior_pharmacist: boolean
          max_discount_amount: number
          max_discount_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          can_adjust_inventory?: boolean
          can_approve_discounts?: boolean
          can_modify_product_prices?: boolean
          can_process_returns?: boolean
          can_view_treatment_pricing?: boolean
          can_write_off_damaged?: boolean
          created_at?: string
          id?: string
          is_senior_pharmacist?: boolean
          max_discount_amount?: number
          max_discount_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          can_adjust_inventory?: boolean
          can_approve_discounts?: boolean
          can_modify_product_prices?: boolean
          can_process_returns?: boolean
          can_view_treatment_pricing?: boolean
          can_write_off_damaged?: boolean
          created_at?: string
          id?: string
          is_senior_pharmacist?: boolean
          max_discount_amount?: number
          max_discount_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prescription_history: {
        Row: {
          counselor_notes: string | null
          created_at: string
          doctor_notes: string | null
          id: string
          patient_id: string | null
          patient_name: string | null
          products: Json
          recorded_by: string | null
          recorded_role: string | null
          services: Json
          visit_id: string | null
        }
        Insert: {
          counselor_notes?: string | null
          created_at?: string
          doctor_notes?: string | null
          id?: string
          patient_id?: string | null
          patient_name?: string | null
          products?: Json
          recorded_by?: string | null
          recorded_role?: string | null
          services?: Json
          visit_id?: string | null
        }
        Update: {
          counselor_notes?: string | null
          created_at?: string
          doctor_notes?: string | null
          id?: string
          patient_id?: string | null
          patient_name?: string | null
          products?: Json
          recorded_by?: string | null
          recorded_role?: string | null
          services?: Json
          visit_id?: string | null
        }
        Relationships: []
      }
      prescription_photos: {
        Row: {
          caption: string | null
          created_at: string
          customer_id: string | null
          id: string
          image_data: string
          prescription_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          image_data: string
          prescription_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          image_data?: string
          prescription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_photos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_photos_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          assigned_staff: string | null
          clinical_notes: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          diagnosis: string | null
          doctor_id: string | null
          id: string
          medications: Json
          rx_date: string
          updated_at: string
        }
        Insert: {
          assigned_staff?: string | null
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          medications?: Json
          rx_date?: string
          updated_at?: string
        }
        Update: {
          assigned_staff?: string | null
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          medications?: Json
          rx_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_orders: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          encounter_id: string | null
          id: string
          items_json: Json
          notes: string | null
          payment_method: string | null
          payment_status: string
          quotation_id: string | null
          receipt_no: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          encounter_id?: string | null
          id?: string
          items_json?: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          quotation_id?: string | null
          receipt_no?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          encounter_id?: string | null
          id?: string
          items_json?: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          quotation_id?: string | null
          receipt_no?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_orders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "counselor_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          pending_dues: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          pending_dues?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          pending_dues?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          bill_no: string | null
          company_name: string | null
          created_at: string
          gst_pct: number | null
          hsn_code: string | null
          id: string
          payment_status: string
          product_name: string
          purchase_date: string
          purchase_rate: number
          quantity: number
          vendor_id: string | null
        }
        Insert: {
          bill_no?: string | null
          company_name?: string | null
          created_at?: string
          gst_pct?: number | null
          hsn_code?: string | null
          id?: string
          payment_status?: string
          product_name: string
          purchase_date?: string
          purchase_rate?: number
          quantity?: number
          vendor_id?: string | null
        }
        Update: {
          bill_no?: string | null
          company_name?: string | null
          created_at?: string
          gst_pct?: number | null
          hsn_code?: string | null
          id?: string
          payment_status?: string
          product_name?: string
          purchase_date?: string
          purchase_rate?: number
          quantity?: number
          vendor_id?: string | null
        }
        Relationships: []
      }
      reconciliation_allocations: {
        Row: {
          amount: number
          bank_txn_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          target_id: string
          target_ref: string | null
          target_type: Database["public"]["Enums"]["recon_target_type"]
        }
        Insert: {
          amount: number
          bank_txn_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          target_id: string
          target_ref?: string | null
          target_type: Database["public"]["Enums"]["recon_target_type"]
        }
        Update: {
          amount?: number
          bank_txn_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          target_id?: string
          target_ref?: string | null
          target_type?: Database["public"]["Enums"]["recon_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_allocations_bank_txn_id_fkey"
            columns: ["bank_txn_id"]
            isOneToOne: false
            referencedRelation: "suspense_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      service_consumption: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          invoice_line_id: string | null
          item_id: string | null
          item_name: string
          qty_used: number
          service_name: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          item_id?: string | null
          item_name: string
          qty_used?: number
          service_name?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          item_id?: string | null
          item_name?: string
          qty_used?: number
          service_name?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_consumption_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_consumption_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_consumption_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_consumption_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      service_wallets: {
        Row: {
          consumed_sessions: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          invoice_id: string | null
          invoice_line_id: string | null
          service_id: string | null
          service_name: string
          status: string
          total_sessions: number
          updated_at: string
        }
        Insert: {
          consumed_sessions?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          service_id?: string | null
          service_name: string
          status?: string
          total_sessions: number
          updated_at?: string
        }
        Update: {
          consumed_sessions?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          service_id?: string | null
          service_name?: string
          status?: string
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_wallets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_wallets_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_wallets_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_wallets_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: true
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_wallets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services_master"
            referencedColumns: ["id"]
          },
        ]
      }
      services_master: {
        Row: {
          active: boolean
          auto_appointment: boolean
          auto_followup: boolean
          category: string
          consumables: Json
          cost_estimate: number
          created_at: string
          default_price: number
          duration_minutes: number | null
          gap_days: number | null
          gst_rate: number
          id: string
          name: string
          sac_code: string
          sessions: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_appointment?: boolean
          auto_followup?: boolean
          category: string
          consumables?: Json
          cost_estimate?: number
          created_at?: string
          default_price?: number
          duration_minutes?: number | null
          gap_days?: number | null
          gst_rate?: number
          id?: string
          name: string
          sac_code: string
          sessions?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_appointment?: boolean
          auto_followup?: boolean
          category?: string
          consumables?: Json
          cost_estimate?: number
          created_at?: string
          default_price?: number
          duration_minutes?: number | null
          gap_days?: number | null
          gst_rate?: number
          id?: string
          name?: string
          sac_code?: string
          sessions?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role_title: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role_title?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role_title?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      staff_roster: {
        Row: {
          created_at: string
          current_room_id: number | null
          id: string
          is_available: boolean
          role: string | null
          staff_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_room_id?: number | null
          id?: string
          is_available?: boolean
          role?: string | null
          staff_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_room_id?: number | null
          id?: string
          is_available?: boolean
          role?: string | null
          staff_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roster_current_room_id_fkey"
            columns: ["current_room_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      suspense_entries: {
        Row: {
          allocated_ref: string | null
          allocation_type: string | null
          amount: number
          created_at: string
          description: string
          direction: string
          id: string
          notes: string | null
          statement_id: string | null
          status: string
          txn_date: string
          updated_at: string
        }
        Insert: {
          allocated_ref?: string | null
          allocation_type?: string | null
          amount?: number
          created_at?: string
          description?: string
          direction?: string
          id?: string
          notes?: string | null
          statement_id?: string | null
          status?: string
          txn_date?: string
          updated_at?: string
        }
        Update: {
          allocated_ref?: string | null
          allocation_type?: string | null
          amount?: number
          created_at?: string
          description?: string
          direction?: string
          id?: string
          notes?: string | null
          statement_id?: string | null
          status?: string
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspense_entries_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_logs: {
        Row: {
          created_at: string
          duration_sec: number | null
          ended_at: string | null
          id: string
          patient_name: string | null
          room: string | null
          started_at: string
          therapist: string | null
          treatment: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          patient_name?: string | null
          room?: string | null
          started_at: string
          therapist?: string | null
          treatment?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          patient_name?: string | null
          room?: string | null
          started_at?: string
          therapist?: string | null
          treatment?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      treatment_packages: {
        Row: {
          client_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          package_details: string | null
          package_name: string
          paid_amount: number
          pending_amount: number | null
          sessions_completed: number
          status: string | null
          total_amount: number
          total_sessions: number
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          package_details?: string | null
          package_name: string
          paid_amount?: number
          pending_amount?: number | null
          sessions_completed?: number
          status?: string | null
          total_amount?: number
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          package_details?: string | null
          package_name?: string
          paid_amount?: number
          pending_amount?: number | null
          sessions_completed?: number
          status?: string | null
          total_amount?: number
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_recommendations: {
        Row: {
          clinical_notes: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          diagnosis: string | null
          doctor_id: string
          encounter_id: string
          id: string
          items_json: Json
          sent_to_counselor_at: string | null
          sent_to_counselor_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id: string
          encounter_id: string
          id?: string
          items_json?: Json
          sent_to_counselor_at?: string | null
          sent_to_counselor_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinical_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          diagnosis?: string | null
          doctor_id?: string
          encounter_id?: string
          id?: string
          items_json?: Json
          sent_to_counselor_at?: string | null
          sent_to_counselor_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_recommendations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_recommendations_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_rooms: {
        Row: {
          current_patient: string | null
          current_visit_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          current_patient?: string | null
          current_visit_id?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          current_patient?: string | null
          current_visit_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          gstin: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      voucher_entries: {
        Row: {
          created_at: string
          credit: number
          debit: number
          id: string
          ledger: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          ledger: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          ledger?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_entries_backup_batch_a: {
        Row: {
          created_at: string | null
          credit: number | null
          debit: number | null
          id: string | null
          ledger: string | null
          voucher_id: string | null
        }
        Insert: {
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          id?: string | null
          ledger?: string | null
          voucher_id?: string | null
        }
        Update: {
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          id?: string | null
          ledger?: string | null
          voucher_id?: string | null
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          amount: number
          cgst: number
          created_at: string
          created_by: string | null
          gst_rate: number
          id: string
          invoice_id: string | null
          narration: string | null
          party: string | null
          payment_mode: string | null
          sgst: number
          updated_at: string
          vdate: string
          voucher_no: string | null
          vtype: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          amount?: number
          cgst?: number
          created_at?: string
          created_by?: string | null
          gst_rate?: number
          id?: string
          invoice_id?: string | null
          narration?: string | null
          party?: string | null
          payment_mode?: string | null
          sgst?: number
          updated_at?: string
          vdate?: string
          voucher_no?: string | null
          vtype: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          amount?: number
          cgst?: number
          created_at?: string
          created_by?: string | null
          gst_rate?: number
          id?: string
          invoice_id?: string | null
          narration?: string | null
          party?: string | null
          payment_mode?: string | null
          sgst?: number
          updated_at?: string
          vdate?: string
          voucher_no?: string | null
          vtype?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_redemptions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_initial: boolean
          notes: string | null
          redeemed_at: string
          room_name: string | null
          therapist_id: string | null
          therapist_name: string | null
          wallet_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_initial?: boolean
          notes?: string | null
          redeemed_at?: string
          room_name?: string | null
          therapist_id?: string | null
          therapist_name?: string | null
          wallet_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_initial?: boolean
          notes?: string | null
          redeemed_at?: string
          room_name?: string | null
          therapist_id?: string | null
          therapist_name?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_redemptions_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_redemptions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "service_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_live_invoices: {
        Row: {
          assigned_staff: string | null
          base_amount: number | null
          cgst: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount_amount: number | null
          gross_total: number | null
          id: string | null
          invoice_date: string | null
          invoice_no: string | null
          paid_amount: number | null
          payment_mode: string | null
          pending_balance: number | null
          replaced_by: string | null
          revised_from: string | null
          sgst: number | null
          source: string | null
          state_code: string | null
          tax_mode: Database["public"]["Enums"]["tax_mode"] | null
          updated_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          assigned_staff?: string | null
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          gross_total?: number | null
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          paid_amount?: number | null
          payment_mode?: string | null
          pending_balance?: number | null
          replaced_by?: string | null
          revised_from?: string | null
          sgst?: number | null
          source?: string | null
          state_code?: string | null
          tax_mode?: Database["public"]["Enums"]["tax_mode"] | null
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          assigned_staff?: string | null
          base_amount?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          gross_total?: number | null
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          paid_amount?: number | null
          payment_mode?: string | null
          pending_balance?: number | null
          replaced_by?: string | null
          revised_from?: string | null
          sgst?: number | null
          source?: string | null
          state_code?: string | null
          tax_mode?: Database["public"]["Enums"]["tax_mode"] | null
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "v_live_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_invoice_inventory: {
        Args: {
          p_invoice_id: string
          p_movement_type?: string
          p_source?: string
        }
        Returns: Json
      }
      check_duplicate_bill: { Args: { p: Json }; Returns: Json }
      claim_integration_outbox_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      deduct_inventory_stock: {
        Args: {
          p_items: Json
          p_movement_type: string
          p_note?: string
          p_source?: string
        }
        Returns: Json
      }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      edit_invoice: {
        Args: {
          p_force_remove?: boolean
          p_header: Json
          p_invoice_id: string
          p_lines: Json
          p_splits?: Json
        }
        Returns: Json
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      import_inventory_rows: {
        Args: { import_id: string; rows: Json }
        Returns: Json
      }
      invoice_removed_lines_impact: {
        Args: { p_invoice_id: string; p_kept_line_ids: string[] }
        Returns: Json
      }
      is_maintenance_mode: { Args: never; Returns: boolean }
      log_billing_event: { Args: { p: Json }; Returns: string }
      materialise_follow_ups: { Args: never; Returns: Json }
      my_billing_access: { Args: never; Returns: Json }
      next_invoice_no: { Args: never; Returns: string }
      next_quotation_no: { Args: never; Returns: string }
      oauth_user_scopes: { Args: { _uid: string }; Returns: string[] }
      rebill_invoice_inventory: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      restock_inventory: {
        Args: {
          p_items: Json
          p_movement_type: string
          p_note?: string
          p_source?: string
        }
        Returns: Json
      }
      reverse_invoice_inventory: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: Json
      }
      revise_invoice: {
        Args: { old_id: string; payload: Json }
        Returns: string
      }
      set_billing_lock: {
        Args: { p_locked: boolean; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      set_duplicate_override: {
        Args: { p_enabled: boolean; p_user_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soundex: { Args: { "": string }; Returns: string }
      text_soundex: { Args: { "": string }; Returns: string }
      void_invoice: {
        Args: { p_id: string; p_reason?: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "doctor"
        | "reception"
        | "accountant"
        | "marketing"
        | "counselor"
        | "therapist"
        | "counselor_1"
        | "counselor_2"
        | "marketing_admin"
        | "caller"
        | "marketing_head"
        | "pharmacist"
      recon_target_type: "invoice" | "purchase" | "vendor_payment" | "expense"
      tax_mode: "inclusive" | "exclusive"
      voucher_type:
        | "sales"
        | "purchase"
        | "payment"
        | "receipt"
        | "contra"
        | "credit_note"
        | "debit_note"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin",
        "doctor",
        "reception",
        "accountant",
        "marketing",
        "counselor",
        "therapist",
        "counselor_1",
        "counselor_2",
        "marketing_admin",
        "caller",
        "marketing_head",
        "pharmacist",
      ],
      recon_target_type: ["invoice", "purchase", "vendor_payment", "expense"],
      tax_mode: ["inclusive", "exclusive"],
      voucher_type: [
        "sales",
        "purchase",
        "payment",
        "receipt",
        "contra",
        "credit_note",
        "debit_note",
      ],
    },
  },
} as const
