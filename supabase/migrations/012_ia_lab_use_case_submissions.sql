-- =========================================================================
-- 012_ia_lab_use_case_submissions.sql
--
-- Lightweight UC proposals submitted by IA Lab members. Admins approve →
-- a real ia_lab_use_cases row is created; reject → reason recorded.
-- Idempotent — safe to re-run.
-- =========================================================================

-- Enum
DO $$
BEGIN
  CREATE TYPE ia_lab_submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Table
CREATE TABLE IF NOT EXISTS ia_lab_use_case_submissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  usage_type           TEXT,
  status               ia_lab_submission_status NOT NULL DEFAULT 'pending',
  rejection_reason     TEXT,
  approved_use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE SET NULL,
  reviewed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT submission_rejection_reason_required
    CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND rejection_reason <> '')),
  CONSTRAINT submission_approved_has_uc
    CHECK (status <> 'approved' OR approved_use_case_id IS NOT NULL),
  CONSTRAINT submission_reviewed_consistent
    CHECK (
      (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ia_lab_use_case_submissions_status_created_idx
  ON ia_lab_use_case_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ia_lab_use_case_submissions_submitted_by_idx
  ON ia_lab_use_case_submissions (submitted_by);

ALTER TABLE ia_lab_use_case_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "submissions read own + admin all"            ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions insert own pending"              ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions submitter edits own pending"     ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions admin updates any"               ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions submitter or admin deletes pending" ON ia_lab_use_case_submissions;

CREATE POLICY "submissions read own + admin all" ON ia_lab_use_case_submissions
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])
  );

CREATE POLICY "submissions insert own pending" ON ia_lab_use_case_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "submissions submitter edits own pending" ON ia_lab_use_case_submissions
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid() AND status = 'pending'
  )
  WITH CHECK (
    submitted_by = auth.uid() AND status = 'pending'
  );

CREATE POLICY "submissions admin updates any" ON ia_lab_use_case_submissions
  FOR UPDATE TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

CREATE POLICY "submissions submitter or admin deletes pending" ON ia_lab_use_case_submissions
  FOR DELETE TO authenticated
  USING (
    (submitted_by = auth.uid() AND status = 'pending')
    OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])
  );

-- Column-level guard trigger: non-admins cannot mutate review/status columns
CREATE OR REPLACE FUNCTION ia_lab_submissions_guard_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.approved_use_case_id IS DISTINCT FROM OLD.approved_use_case_id
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    THEN
      RAISE EXCEPTION 'Only admins can mutate review/status columns';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ia_lab_submissions_guard_columns_trg ON ia_lab_use_case_submissions;
CREATE TRIGGER ia_lab_submissions_guard_columns_trg
  BEFORE UPDATE ON ia_lab_use_case_submissions
  FOR EACH ROW EXECUTE FUNCTION ia_lab_submissions_guard_columns();
