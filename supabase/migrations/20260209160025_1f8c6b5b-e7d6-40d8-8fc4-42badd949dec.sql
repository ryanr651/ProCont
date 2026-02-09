-- Add grupo column to dre_entries to store parser classification
ALTER TABLE public.dre_entries ADD COLUMN grupo TEXT DEFAULT 'OUTROS';

-- Add comment for documentation
COMMENT ON COLUMN public.dre_entries.grupo IS 'Classification group from parser: RECEITA_BRUTA, RECEITA_LIQUIDA, CMV, LUCRO_BRUTO, DESPESAS_OPERACIONAIS, RESULTADO_FINANCEIRO, CONTRIBUICAO_SOCIAL, LUCRO_LIQUIDO, etc.';