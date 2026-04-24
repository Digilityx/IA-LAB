-- 000_ia_lab_initial.sql
-- Consolidated initial schema for project-hub's IA Lab tables in stafftool's shared Supabase.
-- Strict rule: creates only ia_lab_*-prefixed objects. Never touches stafftool-owned objects.
-- See docs/superpowers/specs/2026-04-24-stafftool-merge-design.md for rationale.

-- =========================================================================
-- ENUMS (ia_lab_* prefixed to avoid collision with stafftool types)
-- =========================================================================

CREATE TYPE ia_lab_role AS ENUM ('member', 'admin');

CREATE TYPE ia_lab_sprint_status AS ENUM ('planned', 'active', 'completed');

CREATE TYPE ia_lab_use_case_status AS ENUM (
  'backlog', 'todo', 'in_progress', 'done', 'abandoned'
);

CREATE TYPE ia_lab_use_case_category AS ENUM ('IMPACT', 'LAB', 'PRODUCT');

CREATE TYPE ia_lab_priority_level AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE ia_lab_member_role AS ENUM ('owner', 'contributor', 'reviewer');

CREATE TYPE ia_lab_interest_type AS ENUM (
  'interested', 'want_to_use', 'propose_to_client'
);

CREATE TYPE ia_lab_interest_status AS ENUM ('pending', 'contacted', 'resolved');

-- =========================================================================
-- ia_lab_user_roles — project-hub's role table (orthogonal to stafftool)
-- =========================================================================

CREATE TABLE ia_lab_user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       ia_lab_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes      TEXT
);

CREATE INDEX idx_ia_lab_user_roles_role ON ia_lab_user_roles(role);

ALTER TABLE ia_lab_user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- has_ia_lab_role — helper called from all ia_lab_* table policies
-- =========================================================================

CREATE OR REPLACE FUNCTION has_ia_lab_role(required_roles ia_lab_role[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ia_lab_user_roles
    WHERE user_id = auth.uid() AND role = ANY(required_roles)
  );
$$;

REVOKE ALL ON FUNCTION has_ia_lab_role(ia_lab_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_ia_lab_role(ia_lab_role[]) TO authenticated;

-- Policies for ia_lab_user_roles itself:
-- Everyone authenticated can read their own role (for UI gating); admins see all.
CREATE POLICY "Users see own role" ON ia_lab_user_roles
  FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

CREATE POLICY "Admins manage roles" ON ia_lab_user_roles
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

-- =========================================================================
-- ia_lab_update_updated_at — renamed to avoid collision with stafftool
-- =========================================================================

CREATE OR REPLACE FUNCTION ia_lab_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- ia_lab_sprints
-- =========================================================================

CREATE TABLE ia_lab_sprints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     ia_lab_sprint_status NOT NULL DEFAULT 'planned',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ia_lab_sprints ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_use_cases (central entity)
-- =========================================================================

CREATE TABLE ia_lab_use_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  status             ia_lab_use_case_status NOT NULL DEFAULT 'backlog',
  category           ia_lab_use_case_category NOT NULL DEFAULT 'LAB',
  priority           ia_lab_priority_level NOT NULL DEFAULT 'medium',
  sprint_id          UUID REFERENCES ia_lab_sprints(id) ON DELETE SET NULL,
  owner_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,   -- nullable per Q5b
  mission_id         UUID REFERENCES missions(id) ON DELETE SET NULL,   -- optional link
  documentation      TEXT,
  is_published       BOOLEAN NOT NULL DEFAULT false,
  cover_image_url    TEXT,
  short_description  TEXT,
  deliverable_type   TEXT,
  usage_type         TEXT,
  tools              TEXT,
  target_users       TEXT,
  benchmark_url      TEXT,
  journey_url        TEXT,
  next_steps         TEXT,
  transfer_status    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency for CSV re-runs
CREATE UNIQUE INDEX idx_ia_lab_use_cases_title_category
  ON ia_lab_use_cases (title, category);

CREATE INDEX idx_ia_lab_use_cases_sprint    ON ia_lab_use_cases(sprint_id);
CREATE INDEX idx_ia_lab_use_cases_owner     ON ia_lab_use_cases(owner_id);
CREATE INDEX idx_ia_lab_use_cases_mission   ON ia_lab_use_cases(mission_id);
CREATE INDEX idx_ia_lab_use_cases_status    ON ia_lab_use_cases(status);
CREATE INDEX idx_ia_lab_use_cases_category  ON ia_lab_use_cases(category);
CREATE INDEX idx_ia_lab_use_cases_published ON ia_lab_use_cases(is_published) WHERE is_published = true;

ALTER TABLE ia_lab_use_cases ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ia_lab_use_cases_updated_at
  BEFORE UPDATE ON ia_lab_use_cases
  FOR EACH ROW EXECUTE FUNCTION ia_lab_update_updated_at();

-- =========================================================================
-- ia_lab_use_case_members
-- =========================================================================

CREATE TABLE ia_lab_use_case_members (
  use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role        ia_lab_member_role NOT NULL DEFAULT 'contributor',
  PRIMARY KEY (use_case_id, profile_id)
);

ALTER TABLE ia_lab_use_case_members ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_tags + join table
-- =========================================================================

CREATE TABLE ia_lab_tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1'
);

ALTER TABLE ia_lab_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE ia_lab_use_case_tags (
  use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES ia_lab_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (use_case_id, tag_id)
);

ALTER TABLE ia_lab_use_case_tags ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_use_case_metrics (1:1 with UC)
-- =========================================================================

CREATE TABLE ia_lab_use_case_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id         UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE UNIQUE,
  margin_generated    NUMERIC,
  man_days_estimated  NUMERIC,
  man_days_actual     NUMERIC,
  man_days_saved      NUMERIC GENERATED ALWAYS AS (man_days_estimated - man_days_actual) STORED,
  mrr                 NUMERIC,
  additional_business NUMERIC,
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ia_lab_use_case_metrics ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ia_lab_use_case_metrics_updated_at
  BEFORE UPDATE ON ia_lab_use_case_metrics
  FOR EACH ROW EXECUTE FUNCTION ia_lab_update_updated_at();

-- =========================================================================
-- ia_lab_use_case_documents
-- =========================================================================

CREATE TABLE ia_lab_use_case_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  file_name   TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ia_lab_use_case_documents ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_sprint_use_cases + assignments (multi-assignee)
-- =========================================================================

CREATE TABLE ia_lab_sprint_use_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id       UUID REFERENCES ia_lab_sprints(id) ON DELETE CASCADE NOT NULL,
  use_case_id     UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  estimated_days  NUMERIC,
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sprint_id, use_case_id)
);

ALTER TABLE ia_lab_sprint_use_cases ENABLE ROW LEVEL SECURITY;

CREATE TABLE ia_lab_sprint_use_case_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_use_case_id  UUID REFERENCES ia_lab_sprint_use_cases(id) ON DELETE CASCADE NOT NULL,
  profile_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  estimated_days      NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sprint_use_case_id, profile_id)
);

ALTER TABLE ia_lab_sprint_use_case_assignments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_uc_missions — UC delivery → mission attribution (rev/days/TJM snapshot)
-- =========================================================================

CREATE TABLE ia_lab_uc_missions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id    UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  category       ia_lab_use_case_category NOT NULL,
  consultant_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  mission_client TEXT,
  days_saved     NUMERIC,
  mission_amount NUMERIC,
  tjm_snapshot   NUMERIC,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE ia_lab_uc_missions ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_uc_deals — client deals tied to UCs
-- =========================================================================

CREATE TABLE ia_lab_uc_deals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  client      TEXT NOT NULL,
  amount      NUMERIC NOT NULL,
  quote_date  DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE ia_lab_uc_deals ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_uc_category_history — audit trail
-- =========================================================================

CREATE TABLE ia_lab_uc_category_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id  UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  old_category ia_lab_use_case_category,
  new_category ia_lab_use_case_category NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE ia_lab_uc_category_history ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ia_lab_interest_requests — gallery demand signals
-- =========================================================================

CREATE TABLE ia_lab_interest_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id  UUID REFERENCES ia_lab_use_cases(id) ON DELETE CASCADE NOT NULL,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type         ia_lab_interest_type NOT NULL DEFAULT 'interested',
  message      TEXT,
  status       ia_lab_interest_status NOT NULL DEFAULT 'pending',
  is_read      BOOLEAN NOT NULL DEFAULT false,
  is_archived  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ia_lab_interest_requests_use_case  ON ia_lab_interest_requests(use_case_id);
CREATE INDEX idx_ia_lab_interest_requests_requester ON ia_lab_interest_requests(requester_id);

ALTER TABLE ia_lab_interest_requests ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- RLS POLICIES
-- All SELECT policies are permissive-to-authenticated so stafftool can
-- future-read ia_lab data without additional grants.
-- All write policies gate on has_ia_lab_role(...).
-- =========================================================================

-- ia_lab_sprints
CREATE POLICY "Sprints read by authenticated" ON ia_lab_sprints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can create sprints" ON ia_lab_sprints
  FOR INSERT TO authenticated
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );
CREATE POLICY "Members can update sprints" ON ia_lab_sprints
  FOR UPDATE TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );
CREATE POLICY "Admins can delete sprints" ON ia_lab_sprints
  FOR DELETE TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

-- ia_lab_use_cases
CREATE POLICY "UCs read by authenticated" ON ia_lab_use_cases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can create UCs" ON ia_lab_use_cases
  FOR INSERT TO authenticated
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );
CREATE POLICY "Members can update UCs" ON ia_lab_use_cases
  FOR UPDATE TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );
CREATE POLICY "Admins can delete UCs" ON ia_lab_use_cases
  FOR DELETE TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

-- ia_lab_use_case_members
CREATE POLICY "UC members read by authenticated" ON ia_lab_use_case_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage UC members" ON ia_lab_use_case_members
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_tags
CREATE POLICY "Tags read by authenticated" ON ia_lab_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage tags" ON ia_lab_tags
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_use_case_tags
CREATE POLICY "UC tags read by authenticated" ON ia_lab_use_case_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage UC tags" ON ia_lab_use_case_tags
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_use_case_metrics
CREATE POLICY "Metrics read by authenticated" ON ia_lab_use_case_metrics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage metrics" ON ia_lab_use_case_metrics
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_use_case_documents
CREATE POLICY "UC docs read by authenticated" ON ia_lab_use_case_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage UC docs" ON ia_lab_use_case_documents
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_sprint_use_cases
CREATE POLICY "Sprint UCs read by authenticated" ON ia_lab_sprint_use_cases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage sprint UCs" ON ia_lab_sprint_use_cases
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_sprint_use_case_assignments
CREATE POLICY "Sprint assignments read by authenticated" ON ia_lab_sprint_use_case_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage sprint assignments" ON ia_lab_sprint_use_case_assignments
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_uc_missions
CREATE POLICY "uc_missions read by authenticated" ON ia_lab_uc_missions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage uc_missions" ON ia_lab_uc_missions
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_uc_deals
CREATE POLICY "uc_deals read by authenticated" ON ia_lab_uc_deals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members manage uc_deals" ON ia_lab_uc_deals
  FOR ALL TO authenticated
  USING ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- ia_lab_uc_category_history
CREATE POLICY "uc_category_history read by authenticated" ON ia_lab_uc_category_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members insert uc_category_history" ON ia_lab_uc_category_history
  FOR INSERT TO authenticated
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );
-- No UPDATE/DELETE — history is append-only.

-- ia_lab_interest_requests
CREATE POLICY "Interest requests read by authenticated" ON ia_lab_interest_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated creates own interest requests" ON ia_lab_interest_requests
  FOR INSERT TO authenticated
  WITH CHECK ( requester_id = auth.uid() );
CREATE POLICY "UC owner or admin updates interest request" ON ia_lab_interest_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ia_lab_use_cases
      WHERE id = ia_lab_interest_requests.use_case_id
      AND owner_id = auth.uid()
    )
    OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])
  );

-- =========================================================================
-- ia_lab_list_all_missions — SECURITY DEFINER RPC
-- Lets IA Lab admins see all missions despite stafftool's missions RLS.
-- Gate is inside the function body; non-admins get an empty set.
-- Column whitelist matches verified stafftool schema (see spec § A3).
-- =========================================================================

CREATE OR REPLACE FUNCTION ia_lab_list_all_missions()
RETURNS TABLE (
  id          UUID,
  label       TEXT,
  type        TEXT,
  client_id   UUID,
  start_date  DATE,
  end_date    DATE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.id, m.label, m.type, m.client_id, m.start_date, m.end_date
  FROM missions m
  WHERE has_ia_lab_role(ARRAY['admin']::ia_lab_role[]);
$$;

REVOKE ALL ON FUNCTION ia_lab_list_all_missions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia_lab_list_all_missions() TO authenticated;
