
-- Tabela de links de compartilhamento por empresa
CREATE TABLE public.client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_links TO authenticated;
GRANT ALL ON public.client_links TO service_role;

ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage links for accessible empresas"
ON public.client_links
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = client_links.empresa_id
      AND (e.user_id = auth.uid() OR e.user_id = public.get_master_id(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = client_links.empresa_id
      AND (e.user_id = auth.uid() OR e.user_id = public.get_master_id(auth.uid()))
  )
);

CREATE TRIGGER update_client_links_updated_at
BEFORE UPDATE ON public.client_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de usuários/senhas para cada link
CREATE TABLE public.client_link_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.client_links(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(link_id, username)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_link_users TO authenticated;
GRANT ALL ON public.client_link_users TO service_role;

ALTER TABLE public.client_link_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage link users for accessible links"
ON public.client_link_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_links cl
    JOIN public.empresas e ON e.id = cl.empresa_id
    WHERE cl.id = client_link_users.link_id
      AND (e.user_id = auth.uid() OR e.user_id = public.get_master_id(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_links cl
    JOIN public.empresas e ON e.id = cl.empresa_id
    WHERE cl.id = client_link_users.link_id
      AND (e.user_id = auth.uid() OR e.user_id = public.get_master_id(auth.uid()))
  )
);
