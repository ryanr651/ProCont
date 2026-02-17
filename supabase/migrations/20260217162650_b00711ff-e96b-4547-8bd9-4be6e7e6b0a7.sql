
-- Add empresa_id to dre_entries
ALTER TABLE public.dre_entries ADD COLUMN empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Add empresa_id to balanco_entries  
ALTER TABLE public.balanco_entries ADD COLUMN empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX idx_dre_entries_empresa_id ON public.dre_entries(empresa_id);
CREATE INDEX idx_balanco_entries_empresa_id ON public.balanco_entries(empresa_id);
