-- Core tables for ProCont

-- 1) Empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  cnae TEXT NOT NULL,
  regime_tributario TEXT NOT NULL,
  contexto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresas_user_id ON public.empresas(user_id);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresas: users can select own" ON public.empresas;
CREATE POLICY "Empresas: users can select own"
ON public.empresas
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Empresas: users can insert own" ON public.empresas;
CREATE POLICY "Empresas: users can insert own"
ON public.empresas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Empresas: users can update own" ON public.empresas;
CREATE POLICY "Empresas: users can update own"
ON public.empresas
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Empresas: users can delete own" ON public.empresas;
CREATE POLICY "Empresas: users can delete own"
ON public.empresas
FOR DELETE
USING (auth.uid() = user_id);

-- 2) DRE entries (raw parsed lines)
CREATE TABLE IF NOT EXISTS public.dre_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  periodo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  valor_anterior NUMERIC,
  raw_row JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dre_entries_user_id ON public.dre_entries(user_id);

ALTER TABLE public.dre_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DRE: users can select own" ON public.dre_entries;
CREATE POLICY "DRE: users can select own"
ON public.dre_entries
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "DRE: users can insert own" ON public.dre_entries;
CREATE POLICY "DRE: users can insert own"
ON public.dre_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "DRE: users can delete own" ON public.dre_entries;
CREATE POLICY "DRE: users can delete own"
ON public.dre_entries
FOR DELETE
USING (auth.uid() = user_id);

-- 3) Balanço entries (raw parsed lines)
CREATE TABLE IF NOT EXISTS public.balanco_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  periodo TEXT NOT NULL,
  conta TEXT NOT NULL,
  tipo TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  valor_anterior NUMERIC,
  hierarchy TEXT NOT NULL DEFAULT '',
  raw_row JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balanco_entries_user_id ON public.balanco_entries(user_id);

ALTER TABLE public.balanco_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Balanco: users can select own" ON public.balanco_entries;
CREATE POLICY "Balanco: users can select own"
ON public.balanco_entries
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Balanco: users can insert own" ON public.balanco_entries;
CREATE POLICY "Balanco: users can insert own"
ON public.balanco_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Balanco: users can delete own" ON public.balanco_entries;
CREATE POLICY "Balanco: users can delete own"
ON public.balanco_entries
FOR DELETE
USING (auth.uid() = user_id);

-- 4) User logins (simple audit log)
CREATE TABLE IF NOT EXISTS public.user_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON public.user_logins(user_id);

ALTER TABLE public.user_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "UserLogins: users can insert own" ON public.user_logins;
CREATE POLICY "UserLogins: users can insert own"
ON public.user_logins
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "UserLogins: users can select own" ON public.user_logins;
CREATE POLICY "UserLogins: users can select own"
ON public.user_logins
FOR SELECT
USING (auth.uid() = user_id);

-- 5) updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_empresas_updated_at ON public.empresas;
CREATE TRIGGER update_empresas_updated_at
BEFORE UPDATE ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();