-- scripts/preflight-collision-check.sql
-- Run this in Supabase SQL editor against stafftool prod BEFORE applying 000_ia_lab_initial.sql.
-- Expected result: zero rows. Any output = a rename is needed in the migration.

-- Type collisions
SELECT 'TYPE COLLISION: ' || typname AS problem
FROM pg_type
WHERE typname IN (
  'ia_lab_role', 'ia_lab_sprint_status', 'ia_lab_use_case_status',
  'ia_lab_use_case_category', 'ia_lab_priority_level',
  'ia_lab_member_role', 'ia_lab_interest_type', 'ia_lab_interest_status'
)
UNION ALL
-- Table collisions
SELECT 'TABLE COLLISION: ' || tablename AS problem
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'ia_lab_%'
UNION ALL
-- Function collisions
SELECT 'FUNCTION COLLISION: ' || proname AS problem
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('has_ia_lab_role', 'ia_lab_list_all_missions', 'ia_lab_update_updated_at');
