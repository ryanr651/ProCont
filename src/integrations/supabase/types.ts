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
      balancete_entries: {
        Row: {
          conta: string
          created_at: string
          creditos: number | null
          debitos: number | null
          empresa_id: string | null
          grupo: string | null
          id: string
          natureza: string | null
          periodo: string
          raw_row: Json | null
          saldo_anterior: number | null
          saldo_atual: number | null
          user_id: string
        }
        Insert: {
          conta: string
          created_at?: string
          creditos?: number | null
          debitos?: number | null
          empresa_id?: string | null
          grupo?: string | null
          id?: string
          natureza?: string | null
          periodo: string
          raw_row?: Json | null
          saldo_anterior?: number | null
          saldo_atual?: number | null
          user_id: string
        }
        Update: {
          conta?: string
          created_at?: string
          creditos?: number | null
          debitos?: number | null
          empresa_id?: string | null
          grupo?: string | null
          id?: string
          natureza?: string | null
          periodo?: string
          raw_row?: Json | null
          saldo_anterior?: number | null
          saldo_atual?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balancete_entries_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      balanco_entries: {
        Row: {
          conta: string
          created_at: string
          empresa_id: string | null
          hierarchy: string
          id: string
          natureza: string | null
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
          natureza?: string | null
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
          natureza?: string | null
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
      client_link_users: {
        Row: {
          created_at: string
          id: string
          link_id: string
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_id: string
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          link_id?: string
          password_hash?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_link_users_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "client_links"
            referencedColumns: ["id"]
          },
        ]
      }
      client_links: {
        Row: {
          created_at: string
          created_by: string
          empresa_id: string
          id: string
          is_active: boolean
          snapshot: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          empresa_id: string
          id?: string
          is_active?: boolean
          snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          empresa_id?: string
          id?: string
          is_active?: boolean
          snapshot?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_links_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
      faturamento_entries: {
        Row: {
          ano: number
          created_at: string
          empresa_id: string | null
          id: string
          mes: string
          outros: number
          periodo: string
          saidas: number
          servicos: number
          total: number
          user_id: string
        }
        Insert: {
          ano: number
          created_at?: string
          empresa_id?: string | null
          id?: string
          mes: string
          outros?: number
          periodo: string
          saidas?: number
          servicos?: number
          total?: number
          user_id: string
        }
        Update: {
          ano?: number
          created_at?: string
          empresa_id?: string | null
          id?: string
          mes?: string
          outros?: number
          periodo?: string
          saidas?: number
          servicos?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturamento_entries_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      master_branding: {
        Row: {
          cnpj_empresa: string | null
          created_at: string
          email_empresa: string | null
          email_responsavel: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nome_empresa: string | null
          nome_responsavel: string | null
          telefone_fixo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cnpj_empresa?: string | null
          created_at?: string
          email_empresa?: string | null
          email_responsavel?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string | null
          nome_responsavel?: string | null
          telefone_fixo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cnpj_empresa?: string | null
          created_at?: string
          email_empresa?: string | null
          email_responsavel?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string | null
          nome_responsavel?: string | null
          telefone_fixo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          master_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          master_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          master_id?: string | null
          status?: string
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
      get_master_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "master" | "funcionario"
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
      app_role: ["master", "funcionario"],
    },
  },
} as const
