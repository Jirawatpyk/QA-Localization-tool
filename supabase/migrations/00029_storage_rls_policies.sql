-- TD-UPLOAD-005: Storage RLS policies for tenant-scoped file access
-- Guardrail #63: Atomic migration in transaction
-- Guardrail #64: App-level + RLS double defense
--
-- Current state: Upload uses service_role admin client (bypasses RLS).
-- These policies protect against direct Supabase client access (anon key)
-- and future client-side download features.
--
-- Storage path pattern: {tenantId}/{projectId}/{fileHash}/{fileName}
-- Bucket: 'project-files' (UPLOAD_STORAGE_BUCKET constant)
--
-- JWT claims used:
--   ((SELECT auth.jwt()) ->> 'tenant_id')  — tenant UUID as text
--   ((SELECT auth.jwt()) ->> 'user_role')   — 'admin' | 'qa_reviewer' | 'native_reviewer'

BEGIN;

-- =============================================================================
-- Section 1: Enable RLS on storage.objects
-- =============================================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Section 2: SELECT — authenticated users can read files in their tenant folder
-- =============================================================================
CREATE POLICY "storage_objects_select_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) ->> 'tenant_id')
  );

-- =============================================================================
-- Section 3: INSERT — authenticated users can upload to their tenant folder
-- =============================================================================
CREATE POLICY "storage_objects_insert_tenant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) ->> 'tenant_id')
  );

-- =============================================================================
-- Section 4: UPDATE — authenticated users can update metadata in their tenant folder
-- =============================================================================
CREATE POLICY "storage_objects_update_tenant" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) ->> 'tenant_id')
  );

-- =============================================================================
-- Section 5: DELETE — admin only within tenant
-- =============================================================================
CREATE POLICY "storage_objects_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) ->> 'tenant_id')
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

COMMIT;
