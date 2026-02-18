-- Custom Access Token Hook for RBAC JWT Claims
-- Injects user_role and tenant_id into JWT claims at token issuance
-- Enable via Supabase Dashboard > Authentication > Hooks > Custom Access Token

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
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
  claims := jsonb_set(claims, '{user_role}', COALESCE(to_jsonb(v_role), 'null'::jsonb));
  claims := jsonb_set(claims, '{tenant_id}', COALESCE(to_jsonb(v_tenant_id::text), 'null'::jsonb));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Permissions: only supabase_auth_admin can execute
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
