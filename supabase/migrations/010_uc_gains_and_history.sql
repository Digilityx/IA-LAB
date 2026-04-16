-- 010_uc_gains_and_history.sql
-- Métriques de gains par catégorie (IMPACT / LAB / PRODUCT) + historique
-- des changements de catégorie.
--
-- Modèle :
--   - uc_missions        : lignes IMPACT ou LAB (consultant + jours économisés,
--                          éventuellement montant mission pour LAB).
--   - uc_deals           : devis signés PRODUCT (client + montant).
--   - uc_category_history: audit trail des changements de catégorie (timeline).

BEGIN;

-- ============================================================================
-- 1. uc_missions (IMPACT + LAB)
-- ============================================================================

CREATE TABLE uc_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  category use_case_category NOT NULL
    CHECK (category IN ('IMPACT', 'LAB')),
  consultant_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  mission_client TEXT,
  days_saved NUMERIC,
  mission_amount NUMERIC,
  tjm_snapshot NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_uc_missions_use_case ON uc_missions(use_case_id);
CREATE INDEX idx_uc_missions_consultant ON uc_missions(consultant_id);

ALTER TABLE uc_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_missions_read" ON uc_missions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "uc_missions_write" ON uc_missions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 2. uc_deals (PRODUCT — devis signés uniquement)
-- ============================================================================

CREATE TABLE uc_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  quote_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_uc_deals_use_case ON uc_deals(use_case_id);

ALTER TABLE uc_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_deals_read" ON uc_deals FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "uc_deals_write" ON uc_deals FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 3. uc_category_history (audit trail)
-- ============================================================================

CREATE TABLE uc_category_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  old_category use_case_category,
  new_category use_case_category NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_uc_category_history_use_case ON uc_category_history(use_case_id, changed_at);

ALTER TABLE uc_category_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_category_history_read" ON uc_category_history FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "uc_category_history_write" ON uc_category_history FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 4. Trigger : log chaque changement de use_cases.category
-- ============================================================================

CREATE OR REPLACE FUNCTION log_use_case_category_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO uc_category_history (use_case_id, old_category, new_category, changed_by)
    VALUES (NEW.id, OLD.category, NEW.category, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_use_case_category_change ON use_cases;
CREATE TRIGGER trg_log_use_case_category_change
AFTER UPDATE OF category ON use_cases
FOR EACH ROW EXECUTE FUNCTION log_use_case_category_change();

-- ============================================================================
-- 5. Backfill : 1 ligne d'historique par UC existant (état initial)
-- ============================================================================

INSERT INTO uc_category_history (use_case_id, old_category, new_category, changed_at)
SELECT id, NULL, category, created_at
FROM use_cases
ON CONFLICT DO NOTHING;

COMMIT;
