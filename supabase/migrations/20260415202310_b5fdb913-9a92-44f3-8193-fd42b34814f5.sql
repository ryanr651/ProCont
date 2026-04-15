
CREATE TABLE public.faturamento_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id),
  periodo TEXT NOT NULL,
  mes TEXT NOT NULL,
  ano INTEGER NOT NULL,
  saidas NUMERIC NOT NULL DEFAULT 0,
  servicos NUMERIC NOT NULL DEFAULT 0,
  outros NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.faturamento_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Faturamento: users can select own" ON public.faturamento_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Faturamento: users can insert own" ON public.faturamento_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Faturamento: users can delete own" ON public.faturamento_entries FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Group can view faturamento_entries" ON public.faturamento_entries FOR SELECT USING (
  user_id IN (
    SELECT p2.user_id FROM profiles p1 JOIN profiles p2 ON (p2.master_id = p1.master_id OR p2.user_id = p1.master_id OR p2.master_id = p1.user_id)
    WHERE p1.user_id = auth.uid()
  )
);
