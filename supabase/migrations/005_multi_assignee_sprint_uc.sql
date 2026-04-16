-- 005_multi_assignee_sprint_uc.sql
-- Permettre plusieurs assignés (chacun avec son budget de jours) par use case dans un sprint.
-- Les colonnes `assigned_to` / `estimated_days` de `sprint_use_cases` sont conservées
-- pour compatibilité mais ne sont plus utilisées par l'app.

CREATE TABLE sprint_use_case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_use_case_id UUID REFERENCES sprint_use_cases(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  estimated_days NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sprint_use_case_id, profile_id)
);

CREATE INDEX idx_suc_assignments_suc ON sprint_use_case_assignments(sprint_use_case_id);
CREATE INDEX idx_suc_assignments_profile ON sprint_use_case_assignments(profile_id);

-- Migrer les assignations existantes (1 personne par UC → 1 ligne dans la nouvelle table)
INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
SELECT id, assigned_to, estimated_days
FROM sprint_use_cases
WHERE assigned_to IS NOT NULL;

-- RLS
ALTER TABLE sprint_use_case_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sprint UC assignments viewable by authenticated" ON sprint_use_case_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members can manage sprint UC assignments" ON sprint_use_case_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
