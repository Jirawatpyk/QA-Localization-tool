-- Fix: Custom Access Token Hook needs SECURITY DEFINER to read user_roles
-- Also handles new users who don't have roles yet (returns claims with null values)

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  v_role varchar;
  v_tenant_id uuid;
BEGIN
  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', COALESCE(to_jsonb(v_role), '"none"'::jsonb));
  claims := jsonb_set(claims, '{tenant_id}', COALESCE(to_jsonb(v_tenant_id::text), '"none"'::jsonb));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
