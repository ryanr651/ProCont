
-- 1) Prevent reading password_hash via the Data API
REVOKE SELECT (password_hash) ON public.client_link_users FROM authenticated;
REVOKE SELECT (password_hash) ON public.client_link_users FROM anon;

-- 2) Logos bucket: ownership-scoped policies + restricted listing
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Masters can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Masters can update own logos" ON storage.objects;
DROP POLICY IF EXISTS "Masters can delete own logos" ON storage.objects;

CREATE POLICY "Authenticated users can list own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Masters can upload own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND public.has_role(auth.uid(), 'master'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Masters can update own logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND public.has_role(auth.uid(), 'master'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Masters can delete own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND public.has_role(auth.uid(), 'master'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Lock down SECURITY DEFINER functions: revoke broad EXECUTE.
--    Trigger-only functions don't need EXECUTE for app roles at all.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cascade_master_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

--    RLS helper functions: keep EXECUTE for authenticated (needed for policy evaluation),
--    but revoke from PUBLIC/anon so they're not callable by unauthenticated clients.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_master_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_user_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated;
