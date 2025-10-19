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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      email_preferences: {
        Row: {
          created_at: string
          frequency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_interactions: {
        Row: {
          created_at: string
          event_description: string
          event_title: string
          id: string
          interaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_description: string
          event_title: string
          id?: string
          interaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_description?: string
          event_title?: string
          id?: string
          interaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          date: string
          description: string
          event_link: string | null
          id: string
          interests: string[]
          location: string
          time: string | null
          title: string
          vibes: string[]
        }
        Insert: {
          created_at?: string
          date: string
          description: string
          event_link?: string | null
          id?: string
          interests: string[]
          location: string
          time?: string | null
          title: string
          vibes: string[]
        }
        Update: {
          created_at?: string
          date?: string
          description?: string
          event_link?: string | null
          id?: string
          interests?: string[]
          location?: string
          time?: string | null
          title?: string
          vibes?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          city: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          profile_picture_url: string | null
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          profile_picture_url?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          profile_picture_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_connections: {
        Row: {
          connected_user_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_user_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_user_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_connections_connected_user_id_fkey"
            columns: ["connected_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interests: {
        Row: {
          created_at: string
          id: string
          interest: string
          is_custom: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interest: string
          is_custom?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interest?: string
          is_custom?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_vibes: {
        Row: {
          created_at: string
          id: string
          is_custom: boolean
          user_id: string
          vibe: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_custom?: boolean
          user_id: string
          vibe: string
        }
        Update: {
          created_at?: string
          id?: string
          is_custom?: boolean
          user_id?: string
          vibe?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_vibes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      website_suggestions: {
        Row: {
          city: string
          created_at: string | null
          id: string
          interests: string[]
          updated_at: string | null
          websites: Json
        }
        Insert: {
          city: string
          created_at?: string | null
          id?: string
          interests: string[]
          updated_at?: string | null
          websites: Json
        }
        Update: {
          city?: string
          created_at?: string | null
          id?: string
          interests?: string[]
          updated_at?: string | null
          websites?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
