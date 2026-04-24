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
