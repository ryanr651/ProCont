-- Tabela para armazenar validação XLS da última importação
CREATE TABLE public.xls_validation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('balanco', 'dre')),
  filename TEXT,
  validation_rows JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.xls_validation_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own validation logs"
ON public.xls_validation_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validation logs"
ON public.xls_validation_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own validation logs"
ON public.xls_validation_logs FOR DELETE
USING (auth.uid() = user_id);

-- Index para busca rápida
CREATE INDEX idx_xls_validation_user_tipo ON public.xls_validation_logs(user_id, tipo);