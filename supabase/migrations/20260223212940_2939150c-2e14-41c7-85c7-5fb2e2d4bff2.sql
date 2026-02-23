
-- Tabela de cache de classificações IA
-- Armazena classificações feitas pela IA para reutilização futura
CREATE TABLE public.classification_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  descricao_normalized TEXT NOT NULL,
  grupo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  contexto_tipo TEXT NOT NULL DEFAULT 'dre', -- 'dre', 'balanco', 'dmpl', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Índice único para evitar duplicatas por usuário + descrição + tipo
  CONSTRAINT unique_classification UNIQUE (user_id, descricao_normalized, contexto_tipo)
);

-- Enable RLS
ALTER TABLE public.classification_cache ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own classifications"
  ON public.classification_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own classifications"
  ON public.classification_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own classifications"
  ON public.classification_cache FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own classifications"
  ON public.classification_cache FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_classification_cache_lookup 
  ON public.classification_cache (user_id, contexto_tipo, descricao_normalized);
