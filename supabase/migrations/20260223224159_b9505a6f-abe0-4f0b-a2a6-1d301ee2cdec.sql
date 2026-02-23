
-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('master', 'funcionario');

-- 2. User roles table (security best practice: separate table)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles table with hierarchy
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name text,
  master_id uuid, -- references profiles.user_id of the master
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Master branding table
CREATE TABLE public.master_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome_empresa text,
  cnpj_empresa text,
  logo_url text,
  telefone_fixo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_branding ENABLE ROW LEVEL SECURITY;

-- 5. Storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- 6. Security definer function: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 7. Security definer function: get master_id for a user
CREATE OR REPLACE FUNCTION public.get_master_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT master_id FROM public.profiles WHERE user_id = _user_id),
    _user_id
  )
$$;

-- 8. Security definer function: check if user is active (cascade logic)
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.status = 'active'
      AND (
        p.master_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.profiles m
          WHERE m.user_id = p.master_id AND m.status = 'active'
        )
      )
  )
$$;

-- 9. Trigger: cascade deactivation
CREATE OR REPLACE FUNCTION public.cascade_master_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
    UPDATE public.profiles
    SET status = 'inactive', updated_at = now()
    WHERE master_id = NEW.user_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cascade_master_status
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cascade_master_status();

-- 10. Trigger: auto-create profile on signup (as master by default)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), 'active');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'master');
  
  INSERT INTO public.master_branding (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 11. RLS policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Masters can view their funcionarios roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = user_roles.user_id
        AND profiles.master_id = auth.uid()
    )
  );

CREATE POLICY "Masters can insert roles for funcionarios"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'master')
    AND role = 'funcionario'
  );

CREATE POLICY "Masters can delete funcionario roles"
  ON public.user_roles FOR DELETE
  USING (
    public.has_role(auth.uid(), 'master')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = user_roles.user_id
        AND profiles.master_id = auth.uid()
    )
  );

-- 12. RLS policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Masters can view funcionario profiles"
  ON public.profiles FOR SELECT
  USING (master_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Masters can update funcionario profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'master')
    AND master_id = auth.uid()
  );

CREATE POLICY "Masters can insert funcionario profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'master')
    AND master_id = auth.uid()
  );

-- 13. RLS policies for master_branding
CREATE POLICY "Users can view own branding"
  ON public.master_branding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Funcionarios can view master branding"
  ON public.master_branding FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.master_id = master_branding.user_id
    )
  );

CREATE POLICY "Masters can update own branding"
  ON public.master_branding FOR UPDATE
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'master'));

-- 14. Storage policies for logos bucket
CREATE POLICY "Anyone can view logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Masters can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND public.has_role(auth.uid(), 'master')
  );

CREATE POLICY "Masters can update own logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND public.has_role(auth.uid(), 'master')
  );

CREATE POLICY "Masters can delete own logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND public.has_role(auth.uid(), 'master')
  );

-- 15. Update existing tables RLS to support hierarchy
-- For empresas: master and their funcionarios share access
CREATE POLICY "Funcionarios can access master empresas"
  ON public.empresas FOR SELECT
  USING (
    user_id IN (
      SELECT p2.user_id FROM public.profiles p1
      JOIN public.profiles p2 ON (
        p2.master_id = p1.master_id OR p2.user_id = p1.master_id OR p2.master_id = p1.user_id
      )
      WHERE p1.user_id = auth.uid()
    )
  );

CREATE POLICY "Funcionarios can insert empresas"
  ON public.empresas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- For dre_entries: shared within master group
CREATE POLICY "Group can view dre_entries"
  ON public.dre_entries FOR SELECT
  USING (
    user_id IN (
      SELECT p2.user_id FROM public.profiles p1
      JOIN public.profiles p2 ON (
        p2.master_id = p1.master_id OR p2.user_id = p1.master_id OR p2.master_id = p1.user_id
      )
      WHERE p1.user_id = auth.uid()
    )
  );

-- For balancete_entries: shared within master group
CREATE POLICY "Group can view balancete_entries"
  ON public.balancete_entries FOR SELECT
  USING (
    user_id IN (
      SELECT p2.user_id FROM public.profiles p1
      JOIN public.profiles p2 ON (
        p2.master_id = p1.master_id OR p2.user_id = p1.master_id OR p2.master_id = p1.user_id
      )
      WHERE p1.user_id = auth.uid()
    )
  );

-- For balanco_entries: shared within master group
CREATE POLICY "Group can view balanco_entries"
  ON public.balanco_entries FOR SELECT
  USING (
    user_id IN (
      SELECT p2.user_id FROM public.profiles p1
      JOIN public.profiles p2 ON (
        p2.master_id = p1.master_id OR p2.user_id = p1.master_id OR p2.master_id = p1.user_id
      )
      WHERE p1.user_id = auth.uid()
    )
  );

-- 16. Trigger for updated_at on profiles and branding
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branding_updated_at
BEFORE UPDATE ON public.master_branding
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 17. Edge function to create funcionario (needs service role to create auth user)
-- Will be handled via edge function
