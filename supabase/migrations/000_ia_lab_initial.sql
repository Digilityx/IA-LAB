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
