-- Create empresas table for accounting firm clients
CREATE TABLE public.empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nome text NOT NULL,
  cnpj text NOT NULL,
  cnae text NOT NULL,
  regime_tributario text NOT NULL,
  contexto text,
  user_id uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can only manage their own companies
CREATE POLICY "Users can view own empresas"
ON public.empresas
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own empresas"
ON public.empresas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own empresas"
ON public.empresas
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own empresas"
ON public.empresas
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX idx_empresas_user_id ON public.empresas(user_id);