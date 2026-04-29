-- =========================================================================
-- 011_ia_lab_documents_bucket.sql
--
-- Creates the private `documents` Storage bucket used by ia_lab_use_case_documents
-- and adds RLS policies on storage.objects mirroring the table-level policies:
--   - read: any authenticated user
--   - write/update/delete: ia_lab member or admin
--
-- Files are accessed via signed URLs from the app (bucket is private).
-- Idempotent — safe to re-run.
-- =========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  26214400,  -- 25 MB
  NULL
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ia_lab read documents bucket"   ON storage.objects;
DROP POLICY IF EXISTS "ia_lab members insert documents" ON storage.objects;
DROP POLICY IF EXISTS "ia_lab members update documents" ON storage.objects;
DROP POLICY IF EXISTS "ia_lab members delete documents" ON storage.objects;

CREATE POLICY "ia_lab read documents bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING ( bucket_id = 'documents' );

CREATE POLICY "ia_lab members insert documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[])
  );

CREATE POLICY "ia_lab members update documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[])
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[])
  );

CREATE POLICY "ia_lab members delete documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[])
  );
