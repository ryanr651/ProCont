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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      balanco_entries: {
        Row: {
          conta: string
          created_at: string
          empresa_id: string | null
          hierarchy: string
          id: string
          periodo: string
          raw_row: Json | null
          tipo: string
          user_id: string
          valor: number
          valor_anterior: number | null
        }
        Insert: {
          conta: string
          created_at?: string
          empresa_id?: string | null
          hierarchy?: string
          id?: string
          periodo: string
          raw_row?: Json | null
          tipo: string
          user_id: string
          valor?: number
          valor_anterior?: number | null
        }
        Update: {
          conta?: string
          created_at?: string
          empresa_id?: string | null
          hierarchy?: string
          id?: string
          periodo?: string
          raw_row?: Json | null
          tipo?: string
          user_id?: string
          valor?: number
          valor_anterior?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "balanco_entries_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_cache: {
        Row: {
          contexto_tipo: string
          created_at: string
          descricao_normalized: string
          grupo: string
          id: string
          motivo: string
          user_id: string
        }
        Insert: {
          contexto_tipo?: string
          created_at?: string
          descricao_normalized: string
          grupo: string
          id?: string
          motivo: string
          user_id: string
        }
        Update: {
          contexto_tipo?: string
          created_at?: string
          descricao_normalized?: string
          grupo?: string
          id?: string
          motivo?: string
          user_id?: string
        }
        Relationships: []
      }
      dre_entries: {
        Row: {
          created_at: string
          descricao: string
          empresa_id: string | null
          grupo: string | null
          id: string
          periodo: string
          raw_row: Json | null
          user_id: string
          valor: number
          valor_anterior: number | null
        }
        Insert: {
          created_at?: string
          descricao: string
          empresa_id?: string | null
          grupo?: string | null
          id?: string
          periodo: string
          raw_row?: Json | null
          user_id: string
          valor?: number
          valor_anterior?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string
          empresa_id?: string | null
          grupo?: string | null
          id?: string
          periodo?: string
          raw_row?: Json | null
          user_id?: string
          valor?: number
          valor_anterior?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dre_entries_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnae: string
          cnpj: string
          contexto: string | null
          created_at: string
          id: string
          nome: string
          regime_tributario: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cnae: string
          cnpj: string
          contexto?: string | null
          created_at?: string
          id?: string
          nome: string
          regime_tributario: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cnae?: string
          cnpj?: string
          contexto?: string | null
          created_at?: string
          id?: string
          nome?: string
          regime_tributario?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_logins: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: []
      }
      xls_validation_logs: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          tipo: string
          user_id: string
          validation_rows: Json
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          tipo: string
          user_id: string
          validation_rows?: Json
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          tipo?: string
          user_id?: string
          validation_rows?: Json
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
