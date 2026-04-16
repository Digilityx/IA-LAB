-- 007_sync_members_assignments.sql
-- Synchronisation automatique entre use_case_members (backlog) et
-- sprint_use_case_assignments (sprint detail), dans les deux sens.
--
-- Règles :
--  A) Ajout d'une assignation dans un sprint → la personne est ajoutée comme
--     contributeur du UC côté backlog (ou devient responsable si le UC n'a pas
--     encore de owner).
--  B) Ajout d'un membre (contributeur/reviewer) dans le backlog → la personne
--     est pré-assignée à 0j dans tous les sprints où le UC est présent.
--  C) Changement du owner_id d'un UC → le nouveau owner est pré-assigné à 0j
--     dans tous les sprints où le UC est présent.
--  D) UC ajouté à un sprint (nouvelle ligne sprint_use_cases) → owner +
--     contributeurs + reviewers sont pré-assignés à 0j.
--
-- Les INSERTs utilisent ON CONFLICT DO NOTHING pour casser les boucles de
-- triggers récursifs (un insert qui ne crée rien ne re-déclenche pas son
-- AFTER INSERT trigger).

BEGIN;

-- ============================================================================
-- 1. Backfill des données existantes (avant la création des triggers)
-- ============================================================================

-- a. Pour chaque assignation sprint existante, si la personne n'est ni owner
--    ni déjà membre du UC, l'ajouter comme contributeur.
INSERT INTO use_case_members (use_case_id, profile_id, role)
SELECT DISTINCT suc.use_case_id, suca.profile_id, 'contributor'::member_role
FROM sprint_use_case_assignments suca
JOIN sprint_use_cases suc ON suc.id = suca.sprint_use_case_id
JOIN use_cases uc ON uc.id = suc.use_case_id
WHERE uc.owner_id IS DISTINCT FROM suca.profile_id
ON CONFLICT (use_case_id, profile_id) DO NOTHING;

-- b. Pour chaque UC dans un sprint, s'assurer que le owner a une assignation
--    (à 0j si absente).
INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
SELECT suc.id, uc.owner_id, 0
FROM sprint_use_cases suc
JOIN use_cases uc ON uc.id = suc.use_case_id
WHERE uc.owner_id IS NOT NULL
ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;

-- c. Pour chaque UC dans un sprint, s'assurer que chaque membre
--    (contributeur/reviewer) a une assignation (à 0j si absente).
INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
SELECT suc.id, ucm.profile_id, 0
FROM sprint_use_cases suc
JOIN use_case_members ucm ON ucm.use_case_id = suc.use_case_id
ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;

-- ============================================================================
-- 2. Fonctions de trigger
-- ============================================================================

-- A. Sprint → Backlog : une nouvelle assignation crée le owner ou un contributeur
CREATE OR REPLACE FUNCTION sync_sprint_assignment_to_backlog()
RETURNS TRIGGER AS $$
DECLARE
  v_use_case_id UUID;
  v_owner_id UUID;
BEGIN
  SELECT suc.use_case_id INTO v_use_case_id
  FROM sprint_use_cases suc
  WHERE suc.id = NEW.sprint_use_case_id;

  IF v_use_case_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_owner_id FROM use_cases WHERE id = v_use_case_id;

  -- Si c'est déjà le owner, rien à faire
  IF v_owner_id = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  -- Pas de owner → cette personne devient le responsable
  IF v_owner_id IS NULL THEN
    UPDATE use_cases SET owner_id = NEW.profile_id WHERE id = v_use_case_id;
  ELSE
    -- Owner déjà défini → ajout comme contributeur (idempotent)
    INSERT INTO use_case_members (use_case_id, profile_id, role)
    VALUES (v_use_case_id, NEW.profile_id, 'contributor'::member_role)
    ON CONFLICT (use_case_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Backlog → Sprint : un nouveau membre est pré-assigné à 0j dans tous les sprints du UC
CREATE OR REPLACE FUNCTION sync_backlog_member_to_sprints()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
  SELECT suc.id, NEW.profile_id, 0
  FROM sprint_use_cases suc
  WHERE suc.use_case_id = NEW.use_case_id
  ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Changement de owner → le nouvel owner est pré-assigné à 0j dans tous les sprints
CREATE OR REPLACE FUNCTION sync_owner_change_to_sprints()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
    INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
    SELECT suc.id, NEW.owner_id, 0
    FROM sprint_use_cases suc
    WHERE suc.use_case_id = NEW.id
    ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. UC ajouté à un sprint → pré-assignations 0j pour owner + tous les membres
CREATE OR REPLACE FUNCTION sync_uc_added_to_sprint()
RETURNS TRIGGER AS $$
BEGIN
  -- Owner
  INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
  SELECT NEW.id, uc.owner_id, 0
  FROM use_cases uc
  WHERE uc.id = NEW.use_case_id AND uc.owner_id IS NOT NULL
  ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;

  -- Members (contributors + reviewers)
  INSERT INTO sprint_use_case_assignments (sprint_use_case_id, profile_id, estimated_days)
  SELECT NEW.id, ucm.profile_id, 0
  FROM use_case_members ucm
  WHERE ucm.use_case_id = NEW.use_case_id
  ON CONFLICT (sprint_use_case_id, profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_sync_sprint_assignment_to_backlog ON sprint_use_case_assignments;
CREATE TRIGGER trg_sync_sprint_assignment_to_backlog
AFTER INSERT ON sprint_use_case_assignments
FOR EACH ROW EXECUTE FUNCTION sync_sprint_assignment_to_backlog();

DROP TRIGGER IF EXISTS trg_sync_backlog_member_to_sprints ON use_case_members;
CREATE TRIGGER trg_sync_backlog_member_to_sprints
AFTER INSERT ON use_case_members
FOR EACH ROW EXECUTE FUNCTION sync_backlog_member_to_sprints();

DROP TRIGGER IF EXISTS trg_sync_owner_change_to_sprints ON use_cases;
CREATE TRIGGER trg_sync_owner_change_to_sprints
AFTER UPDATE OF owner_id ON use_cases
FOR EACH ROW EXECUTE FUNCTION sync_owner_change_to_sprints();

DROP TRIGGER IF EXISTS trg_sync_uc_added_to_sprint ON sprint_use_cases;
CREATE TRIGGER trg_sync_uc_added_to_sprint
AFTER INSERT ON sprint_use_cases
FOR EACH ROW EXECUTE FUNCTION sync_uc_added_to_sprint();

COMMIT;
