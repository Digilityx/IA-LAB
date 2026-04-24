-- scripts/post-apply-verification.sql
-- Run this in Supabase SQL editor AFTER applying 000_ia_lab_initial.sql.
-- Expected result: every row shows "OK".

-- 1. All expected ia_lab_* tables exist
WITH expected(name) AS (VALUES
  ('ia_lab_user_roles'),
  ('ia_lab_sprints'),
  ('ia_lab_use_cases'),
  ('ia_lab_use_case_members'),
  ('ia_lab_tags'),
  ('ia_lab_use_case_tags'),
  ('ia_lab_use_case_metrics'),
  ('ia_lab_use_case_documents'),
  ('ia_lab_sprint_use_cases'),
  ('ia_lab_sprint_use_case_assignments'),
  ('ia_lab_uc_missions'),
  ('ia_lab_uc_deals'),
  ('ia_lab_uc_category_history'),
  ('ia_lab_interest_requests')
)
SELECT
  expected.name,
  CASE WHEN pg_tables.tablename IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected
LEFT JOIN pg_tables ON pg_tables.schemaname='public' AND pg_tables.tablename = expected.name
ORDER BY expected.name;

-- 2. RLS is enabled on every ia_lab_* table
SELECT
  tablename,
  CASE WHEN relrowsecurity THEN 'OK' ELSE 'RLS NOT ENABLED' END AS status
FROM pg_tables
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE pg_tables.schemaname='public' AND tablename LIKE 'ia_lab_%'
ORDER BY tablename;

-- 3. Bootstrap admin row exists
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM ia_lab_user_roles WHERE role='admin') THEN 'OK: admin row present'
       ELSE 'MISSING: bootstrap admin not inserted — check the <YOUR_STAFFTOOL_AUTH_UID> placeholder'
  END AS bootstrap_status;

-- 4. Helper functions exist
SELECT
  proname,
  CASE WHEN proname IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE nspname='public'
  AND proname IN ('has_ia_lab_role', 'ia_lab_update_updated_at', 'ia_lab_list_all_missions')
ORDER BY proname;

-- 5. Sanity RPC call as admin (returns a count)
SELECT COUNT(*) AS admin_visible_missions FROM ia_lab_list_all_missions();
