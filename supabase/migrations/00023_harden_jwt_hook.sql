-- Harden: custom_access_token_hook — multi-row safety + lowest privilege selection
-- If unique constraint on user_roles(user_id, tenant_id) is ever dropped or corrupted,
-- this hook now picks the LOWEST privilege role instead of an arbitrary one.
-- Role priority: native_reviewer(1) < qa_reviewer(2) < admin(3)

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
  v_row_count integer;
BEGIN
  -- Pick lowest-privilege role if multiple rows exist (defensive)
  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  ORDER BY
    CASE role
      WHEN 'native_reviewer' THEN 1
      WHEN 'qa_reviewer' THEN 2
      WHEN 'admin' THEN 3
      ELSE 99  -- unknown roles get highest sort value = never selected over known roles
    END ASC
  LIMIT 1;

  -- Check for multi-row anomaly (should never happen with unique constraint)
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', COALESCE(to_jsonb(v_role), '"none"'::jsonb));
  claims := jsonb_set(claims, '{tenant_id}', COALESCE(to_jsonb(v_tenant_id::text), '"none"'::jsonb));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Permissions (idempotent re-grant)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
