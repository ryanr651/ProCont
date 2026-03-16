
-- Drop the existing permissive UPDATE policy that allows master_id manipulation
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a new UPDATE policy that prevents master_id modification
-- Users can only update their own profile, and master_id must remain unchanged
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND master_id IS NOT DISTINCT FROM (SELECT p.master_id FROM public.profiles p WHERE p.user_id = auth.uid())
);
