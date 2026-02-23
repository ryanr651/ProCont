
-- Create table for balancete (trial balance) entries
CREATE TABLE public.balancete_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id),
  periodo TEXT NOT NULL,
  conta TEXT NOT NULL,
  grupo TEXT DEFAULT 'OUTROS',
  saldo_anterior NUMERIC DEFAULT 0,
  debitos NUMERIC DEFAULT 0,
  creditos NUMERIC DEFAULT 0,
  saldo_atual NUMERIC DEFAULT 0,
  natureza TEXT DEFAULT 'devedora',
  raw_row JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.balancete_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Balancete: users can select own"
ON public.balancete_entries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Balancete: users can insert own"
ON public.balancete_entries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Balancete: users can delete own"
ON public.balancete_entries FOR DELETE
USING (auth.uid() = user_id);
