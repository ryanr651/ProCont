
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plano TEXT NOT NULL DEFAULT 'sem_plano',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plano_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plano_check
      CHECK (plano IN ('sem_plano', 'basico', 'intermediario', 'premium'));
  END IF;
END $$;

-- Grandfather existing users into Premium so they don't lose access
UPDATE public.profiles
SET plano = 'premium', subscription_status = 'active'
WHERE plano = 'sem_plano';

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles(stripe_customer_id);

-- Prevent users from escalating their own plan via the app.
-- Replace the existing "Users can update own profile" policy with one that
-- also freezes plano / subscription_* columns.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (master_id IS DISTINCT FROM (
    SELECT p.master_id FROM public.profiles p WHERE p.user_id = auth.uid()
  ))
  AND plano = (SELECT p.plano FROM public.profiles p WHERE p.user_id = auth.uid())
  AND subscription_status = (SELECT p.subscription_status FROM public.profiles p WHERE p.user_id = auth.uid())
  AND stripe_customer_id IS NOT DISTINCT FROM (SELECT p.stripe_customer_id FROM public.profiles p WHERE p.user_id = auth.uid())
  AND stripe_subscription_id IS NOT DISTINCT FROM (SELECT p.stripe_subscription_id FROM public.profiles p WHERE p.user_id = auth.uid())
  AND subscription_end IS NOT DISTINCT FROM (SELECT p.subscription_end FROM public.profiles p WHERE p.user_id = auth.uid())
);
