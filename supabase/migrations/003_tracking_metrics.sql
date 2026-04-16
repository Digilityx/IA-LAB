-- 003_tracking_metrics.sql
-- Add sprint tracking (days + assignee per sprint), accompaniment metrics, and TJM

-- 1. Add TJM (daily rate) to profiles
ALTER TABLE profiles ADD COLUMN tjm NUMERIC;

-- 2. Create sprint_use_cases junction table
-- Replaces the simple use_cases.sprint_id FK with per-sprint metadata
CREATE TABLE sprint_use_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID REFERENCES sprints(id) ON DELETE CASCADE NOT NULL,
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE NOT NULL,
  estimated_days NUMERIC,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sprint_id, use_case_id)
);

CREATE INDEX idx_sprint_use_cases_sprint ON sprint_use_cases(sprint_id);
CREATE INDEX idx_sprint_use_cases_use_case ON sprint_use_cases(use_case_id);

-- 3. Migrate existing sprint assignments
INSERT INTO sprint_use_cases (sprint_id, use_case_id)
SELECT sprint_id, id FROM use_cases WHERE sprint_id IS NOT NULL;

-- 4. Create use_case_accompaniment table for consulting metrics
CREATE TABLE use_case_accompaniment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE UNIQUE NOT NULL,
  mission_client TEXT,
  consultant_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  jours_economises NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER use_case_accompaniment_updated_at
  BEFORE UPDATE ON use_case_accompaniment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS for sprint_use_cases
ALTER TABLE sprint_use_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sprint use cases viewable by authenticated" ON sprint_use_cases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members can manage sprint use cases" ON sprint_use_cases
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- 6. RLS for use_case_accompaniment
ALTER TABLE use_case_accompaniment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accompaniment viewable by authenticated" ON use_case_accompaniment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members can manage accompaniment" ON use_case_accompaniment
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
