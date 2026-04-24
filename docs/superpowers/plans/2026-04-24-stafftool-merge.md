# Stafftool Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-home project-hub onto stafftool's production Supabase backend with the `ia_lab_*` schema, read-only wrappers on stafftool data, and a project-hub-owned role system — without touching stafftool's codebase or schema.

**Architecture:** Approach A from the design spec (shared Supabase DB, separate codebases, project-hub reads stafftool tables via a typed wrapper layer, project-hub owns its own `ia_lab_*` tables and `ia_lab_user_roles`). See `docs/superpowers/specs/2026-04-24-stafftool-merge-design.md` for rationale.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn (new-york/neutral), `@supabase/ssr` 0.8, `@supabase/supabase-js` 2.97, `@dnd-kit`, Zod 4, Supabase CLI (for migrations), Vercel (deployment).

**Testing posture:** Testing infrastructure is explicitly deferred per the spec. Verification uses: `npx tsc --noEmit` for type correctness, `npm run dev` + browser for runtime checks, Supabase SQL editor for DB-state checks, and the CSV import's `--dry-run` for data checks.

**Non-goals (do NOT do in this plan):** SSO across apps; stafftool reading project-hub data; Next.js upgrade; adding a test framework; PLAN.md's three pending UI features (list view, detail Sheet, Settings refonte) — those happen in a later project.

---

## File structure

### Files to CREATE

| Path | Responsibility |
|---|---|
| `supabase/migrations/000_ia_lab_initial.sql` | Consolidated schema: all `ia_lab_*` enums, tables, policies, functions, RPC, bootstrap INSERT |
| `supabase/seed_ia_lab_uc_review.sql` | Adapted seed UPDATEs targeting `ia_lab_use_cases` (replaces `seed_uc_review.sql`) |
| `scripts/preflight-collision-check.sql` | One-time SQL to run against prod before applying the migration |
| `scripts/post-apply-verification.sql` | One-time SQL to run after applying the migration to confirm the schema landed |
| `src/lib/stafftool/index.ts` | Barrel re-export for the wrapper module |
| `src/lib/stafftool/types.ts` | Hand-written types for stafftool tables we read |
| `src/lib/stafftool/profiles.ts` | Read-only helpers for `profiles` + TJM/CJM JSONB handling |
| `src/lib/stafftool/missions.ts` | Read-only helpers for `missions`, including the admin RPC call |
| `src/lib/ia-lab-roles.ts` | Client-side `ia_lab_user_roles` helpers (role checks for UI gating) |
| `.env.example` | Env var template |
| `.github/workflows/guard-stafftool-tables.yml` | CI grep-guard preventing stafftool table access outside `src/lib/stafftool/` |

### Files to MODIFY

| Path | What changes |
|---|---|
| `src/types/database.ts` | Drop `is_placeholder`, `role` from `Profile`; rename `department` → `team`; change `tjm: number \| null` → `tjm: TjmYearlyJsonb \| null`; add `cjm`; rename UC-related types to reflect `ia_lab_*` table names where needed |
| Every `.tsx/.ts` file referencing `from('use_cases'\|'sprints'\|'tags'\|'use_case_*'\|'uc_*'\|'interest_requests')` | Rename to `from('ia_lab_use_cases'\|'ia_lab_sprints'\|'ia_lab_tags'\|'ia_lab_use_case_*'\|'ia_lab_uc_*'\|'ia_lab_interest_requests')` |
| Every `.tsx/.ts` file referencing `profile.department` | → `profile.team` |
| Every `.tsx/.ts` file with direct `profile.tjm` arithmetic | → `getEffectiveTjm(profile, year)` |
| Every `.tsx/.ts` file gating on `profile.role === 'admin'\|'member'\|'viewer'` | → `hasIaLabRole(['admin'])` / `hasIaLabRole(['admin','member'])` from `src/lib/ia-lab-roles.ts` |
| `src/components/backlog/create-use-case-dialog.tsx` and anywhere creating placeholder profiles | Remove the placeholder code path |
| `src/app/(dashboard)/settings/page.tsx` | Make the profile tab read-only (links out to stafftool for edits); strip any profile-edit writes |
| `scripts/import-airtable.ts` | Name → profile lookup via stafftool wrapper; `ia_lab_use_cases` target; unknown owner → `NULL`; `--dry-run` flag; idempotent via `ON CONFLICT DO NOTHING` |
| `README.md` | Add env var + deployment instructions |
| `CLAUDE.md` | Update to describe the merged world (stafftool-owned profile, `ia_lab_*` tables, wrapper layer, role system, read-only discipline) |

### Files to DELETE

| Path | Reason |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Replaced by consolidated 000 |
| `supabase/migrations/002_extend_schema.sql` | Replaced by consolidated 000 |
| `supabase/migrations/003_tracking_metrics.sql` | Replaced by consolidated 000 |
| `supabase/migrations/004_next_steps_transfer.sql` | Replaced by consolidated 000 |
| `supabase/migrations/005_multi_assignee_sprint_uc.sql` | Replaced by consolidated 000 |
| `supabase/migrations/006_fix_mojibake.sql` | Not needed — fresh DB state after consolidation |
| `supabase/migrations/007_sync_members_assignments.sql` | Replaced by consolidated 000 |
| `supabase/migrations/008_sprint_delete_policy.sql` | Replaced by consolidated 000 |
| `supabase/migrations/009_interest_requests_read_archive.sql` | Replaced by consolidated 000 |
| `supabase/migrations/010_uc_gains_and_history.sql` | Replaced by consolidated 000 |
| `supabase/seed_uc_review.sql` | Replaced by `seed_ia_lab_uc_review.sql` |

---

## Task Index

- **Phase 1 — Schema** (Tasks 1-8)
- **Phase 2 — Seed & pre/post-flight scripts** (Tasks 9-11)
- **Phase 3 — Stafftool wrapper layer + role helpers** (Tasks 12-16)
- **Phase 4 — Type + code renames** (Tasks 17-23)
- **Phase 5 — Placeholder & profile-edit removal** (Tasks 24-25)
- **Phase 6 — CSV import adaptation** (Tasks 26-27)
- **Phase 7 — CI guard** (Task 28)
- **Phase 8 — Env + Vercel + docs** (Tasks 29-31)
- **Phase 9 — Apply migration + verify (manual)** (Tasks 32-35)

---

## Phase 1 — Schema

### Task 1: Delete old migrations

**Files:**
- Delete: `supabase/migrations/001_initial_schema.sql` through `supabase/migrations/010_uc_gains_and_history.sql` (10 files)

- [ ] **Step 1: Delete the 10 old migration files**

```bash
cd "C:/Users/enzor/OneDrive/Bureau/IA-LAB"
rm supabase/migrations/001_initial_schema.sql
rm supabase/migrations/002_extend_schema.sql
rm supabase/migrations/003_tracking_metrics.sql
rm supabase/migrations/004_next_steps_transfer.sql
rm supabase/migrations/005_multi_assignee_sprint_uc.sql
rm supabase/migrations/006_fix_mojibake.sql
rm supabase/migrations/007_sync_members_assignments.sql
rm supabase/migrations/008_sprint_delete_policy.sql
rm supabase/migrations/009_interest_requests_read_archive.sql
rm supabase/migrations/010_uc_gains_and_history.sql
```

- [ ] **Step 2: Verify only `.temp/` and `seed_uc_review.sql` remain in `supabase/`**

Run: `ls supabase/ && ls supabase/migrations/`
Expected: `supabase/` shows `.temp/ migrations/ seed_uc_review.sql`; `supabase/migrations/` is empty.

- [ ] **Step 3: Commit**

```bash
git add -u supabase/migrations/
git commit -m "refactor(db): drop pre-merge migrations 001-010 (never applied to prod)"
```

---

### Task 2: Create consolidated migration — header, enums, role helper

**Files:**
- Create: `supabase/migrations/000_ia_lab_initial.sql`

- [ ] **Step 1: Create the file with header, enums, and the role helper**

```sql
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
```

- [ ] **Step 2: Verify the file parses locally as a syntax check**

Run: `npx supabase db lint --file supabase/migrations/000_ia_lab_initial.sql` if supabase CLI is installed, otherwise `cat supabase/migrations/000_ia_lab_initial.sql | head -100` and eyeball for obvious typos.
Expected: no lint errors (or file content looks right on eyeball).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): start consolidated ia_lab migration — enums + role helper"
```

---

### Task 3: Add project-hub core tables (sprints, use_cases, members, tags)

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql` (append)

- [ ] **Step 1: Append the core tables to the migration file**

```sql

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): add ia_lab_sprints, use_cases, members, tags"
```

---

### Task 4: Add metrics, documents, sprint join tables, UC sub-entities

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql` (append)

- [ ] **Step 1: Append remaining tables**

```sql

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): add ia_lab metrics, documents, sprint-UC joins, uc_missions, uc_deals, category_history, interest_requests"
```

---

### Task 5: Add RLS policies for all ia_lab_ tables

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql` (append)

- [ ] **Step 1: Append policies block**

```sql

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): add RLS policies for all ia_lab tables (gated via has_ia_lab_role)"
```

---

### Task 6: Add SECURITY DEFINER RPC for admin mission access

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql` (append)

- [ ] **Step 1: Append the RPC function**

```sql

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): add ia_lab_list_all_missions SECURITY DEFINER RPC for admin mission picker"
```

---

### Task 7: Add bootstrap admin placeholder

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql` (append)

- [ ] **Step 1: Append the bootstrap block with a clear placeholder**

```sql

-- =========================================================================
-- BOOTSTRAP
-- Replace <YOUR_STAFFTOOL_AUTH_UID> with the UID obtained from:
-- Supabase dashboard → Authentication → Users → search your email
-- This INSERT is the only way to create the first IA Lab admin, because
-- the "Admins manage roles" policy requires an existing admin.
-- =========================================================================

INSERT INTO ia_lab_user_roles (user_id, role, notes)
VALUES (
  '<YOUR_STAFFTOOL_AUTH_UID>'::uuid,
  'admin',
  'Bootstrap admin — created by migration 000_ia_lab_initial.sql'
)
ON CONFLICT (user_id) DO NOTHING;
```

- [ ] **Step 2: Add a sentinel comment at the bottom of the file**

```sql

-- End of 000_ia_lab_initial.sql
-- Before applying: replace <YOUR_STAFFTOOL_AUTH_UID> above.
-- After applying: run scripts/post-apply-verification.sql and confirm rowcount > 0 on ia_lab_user_roles.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "feat(db): add bootstrap admin INSERT to consolidated migration"
```

---

### Task 8: Migration self-check

**Files:**
- Read: `supabase/migrations/000_ia_lab_initial.sql`

- [ ] **Step 1: Verify file structure with a grep sweep**

Run:
```bash
grep -c "^CREATE TABLE" supabase/migrations/000_ia_lab_initial.sql
grep -c "^CREATE TYPE" supabase/migrations/000_ia_lab_initial.sql
grep -c "^CREATE POLICY" supabase/migrations/000_ia_lab_initial.sql
grep -c "^CREATE FUNCTION\|^CREATE OR REPLACE FUNCTION" supabase/migrations/000_ia_lab_initial.sql
```

Expected:
- `CREATE TABLE`: 13 (ia_lab_user_roles + ia_lab_sprints + ia_lab_use_cases + ia_lab_use_case_members + ia_lab_tags + ia_lab_use_case_tags + ia_lab_use_case_metrics + ia_lab_use_case_documents + ia_lab_sprint_use_cases + ia_lab_sprint_use_case_assignments + ia_lab_uc_missions + ia_lab_uc_deals + ia_lab_uc_category_history + ia_lab_interest_requests = 14) — **14**, not 13 — recount if off
- `CREATE TYPE`: 8 (ia_lab_role + 7 domain enums)
- `CREATE POLICY`: ~35 (2 on user_roles + ~33 across the 13 other tables)
- `CREATE [OR REPLACE ]FUNCTION`: 3 (has_ia_lab_role, ia_lab_update_updated_at, ia_lab_list_all_missions)

- [ ] **Step 2: Verify no accidental references to stafftool tables for DDL**

Run: `grep -iE "^(CREATE|ALTER|DROP)\s+(TABLE|TYPE|FUNCTION|POLICY|INDEX).*\b(profiles|missions|clients|cras|user_roles|mission_consultants|expenses|expertises|absences|mission_feedbacks|ressources|revenue_targets|consultants_targets|teams)\b" supabase/migrations/000_ia_lab_initial.sql`
Expected: **empty** (zero lines). The only references to stafftool tables are FKs (`REFERENCES profiles(id)`, `REFERENCES missions(id)`) and the RPC's `FROM missions m`, neither of which modifies the target.

- [ ] **Step 3: If discrepancies — fix inline in the migration file, then re-commit**

If step 1 or 2 shows unexpected results: open the file, fix, `git add` + `git commit -m "fix(db): migration self-check adjustment"`.

---

## Phase 2 — Seed & pre/post-flight scripts

### Task 9: Adapt seed_uc_review.sql to new table names

**Files:**
- Create: `supabase/seed_ia_lab_uc_review.sql`
- Delete: `supabase/seed_uc_review.sql`

- [ ] **Step 1: Copy and rename the seed, then replace table references**

```bash
cp supabase/seed_uc_review.sql supabase/seed_ia_lab_uc_review.sql
```

- [ ] **Step 2: Edit the new file — find-and-replace `use_cases` → `ia_lab_use_cases`**

Open `supabase/seed_ia_lab_uc_review.sql` and do a single `UPDATE use_cases` → `UPDATE ia_lab_use_cases` replacement across the file. (The original file has ~20 UPDATE statements, all targeting `use_cases`.)

- [ ] **Step 3: Update the header comment**

Replace the first two lines of `supabase/seed_ia_lab_uc_review.sql` with:

```sql
-- seed_ia_lab_uc_review.sql
-- IA Lab review data (March 2026). Run AFTER 000_ia_lab_initial.sql has been applied AND after the Airtable import.
```

- [ ] **Step 4: Delete the old seed**

```bash
rm supabase/seed_uc_review.sql
```

- [ ] **Step 5: Verify**

Run: `grep -c "UPDATE ia_lab_use_cases" supabase/seed_ia_lab_uc_review.sql && grep -c "UPDATE use_cases" supabase/seed_ia_lab_uc_review.sql`
Expected: first count > 0, second count = 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/seed_ia_lab_uc_review.sql
git add -u supabase/seed_uc_review.sql
git commit -m "refactor(db): rename seed_uc_review to seed_ia_lab_uc_review with updated table name"
```

---

### Task 10: Write the pre-flight collision check

**Files:**
- Create: `scripts/preflight-collision-check.sql`

- [ ] **Step 1: Create the script**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/preflight-collision-check.sql
git commit -m "feat(scripts): pre-flight collision check for ia_lab migration"
```

---

### Task 11: Write the post-apply verification script

**Files:**
- Create: `scripts/post-apply-verification.sql`

- [ ] **Step 1: Create the script**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/post-apply-verification.sql
git commit -m "feat(scripts): post-apply verification for ia_lab migration"
```

---

## Phase 3 — Stafftool wrapper layer + role helpers

### Task 12: Create stafftool types

**Files:**
- Create: `src/lib/stafftool/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/stafftool/types.ts
// Hand-written types for stafftool tables we read.
// Source: spec § Appendix A2/A3 (verified against prod schema 2026-04-24).

export type TjmYearlyJsonb = Record<string, number> // e.g. { "2024": 800, "2025": 850 }
export type CjmYearlyJsonb = Record<string, number>

export interface StafftoolProfileExpertise {
  id: string
  name: string
  grade: number
}

export interface StafftoolProfileExpertises {
  expertises: StafftoolProfileExpertise[]
}

export interface StafftoolProfile {
  id: string
  email: string
  full_name: string
  created_at: string
  updated_at: string
  team: string | null
  seniority: string | null
  holidays_current_year: number | null
  holidays_previous_year: number | null
  holidays_two_years_ago: number | null
  rtt: number | null
  arrival_date: string | null
  departure_date: string | null
  avatar_url: string | null
  managed: string | null
  expertises: StafftoolProfileExpertises | null
  can_access_feature: boolean
  role: string // stafftool user category — e.g. "consultant". NOT a permission grant.
  slack_id: string | null
  tjm: TjmYearlyJsonb | null
  cjm: CjmYearlyJsonb | null
}

export interface StafftoolMission {
  id: string
  label: string
  type: string | null
  client_id: string | null
  start_date: string | null
  end_date: string | null
  // Other columns exist (budgets, manager_id, responsable_id) but we don't expose them to project-hub for now.
}

export interface StafftoolClient {
  id: string
  name: string
  // Unknown extras; we don't need them in v1.
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors (type-only file, should compile clean).

- [ ] **Step 3: Commit**

```bash
git add src/lib/stafftool/types.ts
git commit -m "feat(stafftool): add hand-written types for shared tables"
```

---

### Task 13: Create the profiles wrapper

**Files:**
- Create: `src/lib/stafftool/profiles.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/stafftool/profiles.ts
// Read-only helpers for stafftool's profiles table.
// Project-hub code must access profiles via this module only.
import { createClient } from '@/lib/supabase/client'
import type { StafftoolProfile, TjmYearlyJsonb, CjmYearlyJsonb } from './types'

const PROFILE_COLUMNS =
  'id, email, full_name, avatar_url, team, arrival_date, departure_date, tjm, cjm, role, can_access_feature'

export async function getProfile(id: string): Promise<StafftoolProfile | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle<StafftoolProfile>()
  if (error) throw error
  return data
}

export async function listProfilesByIds(ids: string[]): Promise<StafftoolProfile[]> {
  if (ids.length === 0) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as StafftoolProfile[]
}

export async function searchProfiles(query: string, limit = 20): Promise<StafftoolProfile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .ilike('full_name', `%${query}%`)
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StafftoolProfile[]
}

/**
 * Returns the effective TJM for a given year.
 * Falls back to the most recent prior year present, then returns null.
 */
export function getEffectiveTjm(
  profile: Pick<StafftoolProfile, 'tjm'>,
  year: number = new Date().getFullYear(),
): number | null {
  return pickYearlyRate(profile.tjm, year)
}

/**
 * Returns the effective CJM for a given year. Same fallback behavior as TJM.
 */
export function getEffectiveCjm(
  profile: Pick<StafftoolProfile, 'cjm'>,
  year: number = new Date().getFullYear(),
): number | null {
  return pickYearlyRate(profile.cjm, year)
}

function pickYearlyRate(
  rates: TjmYearlyJsonb | CjmYearlyJsonb | null | undefined,
  year: number,
): number | null {
  if (!rates) return null
  const exact = rates[String(year)]
  if (typeof exact === 'number') return exact
  // Fallback: most recent prior year present
  const priors = Object.keys(rates)
    .map(Number)
    .filter((y) => !Number.isNaN(y) && y < year)
    .sort((a, b) => b - a)
  for (const y of priors) {
    const v = rates[String(y)]
    if (typeof v === 'number') return v
  }
  return null
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test — log a real profile**

Create a throwaway file `src/lib/stafftool/_smoke.ts`:

```typescript
import { searchProfiles, getEffectiveTjm } from './profiles'
async function main() {
  const profiles = await searchProfiles('antoine', 1)
  console.log('Found:', profiles[0]?.full_name, 'team:', profiles[0]?.team)
  console.log('TJM 2026:', getEffectiveTjm(profiles[0], 2026))
}
main().catch(console.error)
```

Run: `npx tsx src/lib/stafftool/_smoke.ts`
Expected: one profile logged with a name and TJM > 0. (Requires `.env.local` set — Task 29 covers that. If not yet, skip this step and come back later.)
Then: `rm src/lib/stafftool/_smoke.ts` — don't commit it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stafftool/profiles.ts
git commit -m "feat(stafftool): add profiles wrapper with TJM/CJM helpers"
```

---

### Task 14: Create the missions wrapper

**Files:**
- Create: `src/lib/stafftool/missions.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/stafftool/missions.ts
// Read-only helpers for stafftool's missions table.
import { createClient } from '@/lib/supabase/client'
import type { StafftoolMission } from './types'

const MISSION_COLUMNS = 'id, label, type, client_id, start_date, end_date'

export async function getMission(id: string): Promise<StafftoolMission | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('missions')
    .select(MISSION_COLUMNS)
    .eq('id', id)
    .maybeSingle<StafftoolMission>()
  if (error) throw error
  return data
}

export interface SearchMissionsOpts {
  query?: string
  consultantId?: string
}

/**
 * Searches missions the current user can see (subject to stafftool's RLS).
 * Use listAllMissionsForAdmin() when the caller must see every mission.
 */
export async function searchMissions(opts: SearchMissionsOpts = {}): Promise<StafftoolMission[]> {
  const supabase = createClient()
  let q = supabase.from('missions').select(MISSION_COLUMNS).limit(50)
  if (opts.query) q = q.ilike('label', `%${opts.query}%`)
  // consultantId: filter via mission_consultants join. Read-only here too.
  // (If opts.consultantId is set, use the embed pattern: select '*, mission_consultants!inner(consultant_id)'
  // — keeping simple for v1.)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as StafftoolMission[]
}

/**
 * IA Lab admin-only: returns ALL missions via the SECURITY DEFINER RPC.
 * Non-admins get an empty array (the RPC's internal gate rejects them).
 */
export async function listAllMissionsForAdmin(): Promise<StafftoolMission[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('ia_lab_list_all_missions')
  if (error) throw error
  return (data ?? []) as StafftoolMission[]
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stafftool/missions.ts
git commit -m "feat(stafftool): add missions wrapper with admin RPC path"
```

---

### Task 15: Barrel-export the stafftool wrapper module

**Files:**
- Create: `src/lib/stafftool/index.ts`

- [ ] **Step 1: Create the barrel file**

```typescript
// src/lib/stafftool/index.ts
export * from './types'
export * from './profiles'
export * from './missions'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stafftool/index.ts
git commit -m "feat(stafftool): barrel export"
```

---

### Task 16: Create the ia_lab_user_roles client helper

**Files:**
- Create: `src/lib/ia-lab-roles.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/ia-lab-roles.ts
// Client-side IA Lab role lookup for UI gating.
// The DB is the authority — RLS will reject writes regardless of UI state — but
// hiding disabled controls is nicer UX.
import { createClient } from '@/lib/supabase/client'

export type IaLabRole = 'member' | 'admin'

export interface IaLabRoleRow {
  user_id: string
  role: IaLabRole
  granted_at: string
  granted_by: string | null
  notes: string | null
}

/**
 * Returns the current user's IA Lab role, or null if they have no row
 * (i.e. effectively a viewer).
 */
export async function getCurrentIaLabRole(): Promise<IaLabRole | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('ia_lab_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle<{ role: IaLabRole }>()
  if (error) throw error
  return data?.role ?? null
}

/**
 * True if the current user holds any of the given IA Lab roles.
 * Null role argument array is treated as "any role" (member or admin).
 */
export async function hasIaLabRole(required: IaLabRole[] = ['member', 'admin']): Promise<boolean> {
  const role = await getCurrentIaLabRole()
  return role !== null && required.includes(role)
}

export async function isIaLabAdmin(): Promise<boolean> {
  return hasIaLabRole(['admin'])
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ia-lab-roles.ts
git commit -m "feat(roles): add client-side IA Lab role helpers"
```

---

## Phase 4 — Type + code renames

### Task 17: Update database.ts types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Read the current file**

```bash
cat src/types/database.ts | head -50
```

- [ ] **Step 2: Rewrite the `Profile` interface — drop `is_placeholder` and `role`, rename `department` → `team`, change `tjm` to JSONB shape, add `cjm`**

In `src/types/database.ts`, replace the existing `Profile` interface with:

```typescript
import type { TjmYearlyJsonb, CjmYearlyJsonb } from '@/lib/stafftool/types'

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  team: string | null
  tjm: TjmYearlyJsonb | null
  cjm: CjmYearlyJsonb | null
  arrival_date: string | null
  departure_date: string | null
  role: string  // stafftool user category (e.g. "consultant") — not a permission grant
  created_at: string
}
```

- [ ] **Step 3: Remove the `UserRole` type export (project-hub no longer defines it — role grants live in ia_lab_user_roles)**

Delete the line `export type UserRole = 'admin' | 'member' | 'viewer'` from the top of the file.

- [ ] **Step 4: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: **many errors** — those are exactly the files that need renames in subsequent tasks. Make note of the error count: `npx tsc --noEmit 2>&1 | grep -c "error TS"`.

- [ ] **Step 5: Commit (even though type-errors remain — the subsequent tasks fix them)**

```bash
git add src/types/database.ts
git commit -m "refactor(types): reshape Profile to match shared stafftool profiles — breaks downstream on purpose"
```

---

### Task 18: Rename all `from('use_cases'|'sprints'|...)` to `ia_lab_*` in code

**Files:**
- Modify: every `.ts` / `.tsx` file in `src/` that references old project-hub table names

- [ ] **Step 1: Enumerate files that need changes**

Run:
```bash
grep -rln --include="*.ts" --include="*.tsx" -E "\.from\(['\"]((use_cases)|(sprints)|(tags)|(use_case_members)|(use_case_tags)|(use_case_metrics)|(use_case_documents)|(sprint_use_cases)|(sprint_use_case_assignments)|(uc_missions)|(uc_deals)|(uc_category_history)|(interest_requests))['\"]" src/
```
Expected: a list of files (probably 20-30).

- [ ] **Step 2: For each file, run a sed replacement (back up first)**

For each table name, replace the `.from('<old>')` call with `.from('<new>')`:

```bash
# Use a single find + sed pass for all renames
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | xargs -0 sed -i "s/\.from(['\"]use_cases['\"]/.from('ia_lab_use_cases'/g; \
  s/\.from(['\"]sprints['\"]/.from('ia_lab_sprints'/g; \
  s/\.from(['\"]tags['\"]/.from('ia_lab_tags'/g; \
  s/\.from(['\"]use_case_members['\"]/.from('ia_lab_use_case_members'/g; \
  s/\.from(['\"]use_case_tags['\"]/.from('ia_lab_use_case_tags'/g; \
  s/\.from(['\"]use_case_metrics['\"]/.from('ia_lab_use_case_metrics'/g; \
  s/\.from(['\"]use_case_documents['\"]/.from('ia_lab_use_case_documents'/g; \
  s/\.from(['\"]sprint_use_cases['\"]/.from('ia_lab_sprint_use_cases'/g; \
  s/\.from(['\"]sprint_use_case_assignments['\"]/.from('ia_lab_sprint_use_case_assignments'/g; \
  s/\.from(['\"]uc_missions['\"]/.from('ia_lab_uc_missions'/g; \
  s/\.from(['\"]uc_deals['\"]/.from('ia_lab_uc_deals'/g; \
  s/\.from(['\"]uc_category_history['\"]/.from('ia_lab_uc_category_history'/g; \
  s/\.from(['\"]interest_requests['\"]/.from('ia_lab_interest_requests'/g"
```

(On Git Bash for Windows, `find` + `xargs -0` should work. If not, use PowerShell equivalents.)

- [ ] **Step 3: Verify zero matches remain for old names**

Run:
```bash
grep -rn --include="*.ts" --include="*.tsx" -E "\.from\(['\"]((use_cases)|(sprints)|(tags)|(use_case_members)|(use_case_tags)|(use_case_metrics)|(use_case_documents)|(sprint_use_cases)|(sprint_use_case_assignments)|(uc_missions)|(uc_deals)|(uc_category_history)|(interest_requests))['\"]" src/
```
Expected: **empty**. If any remain, edit them manually.

- [ ] **Step 4: Also fix PostgREST embed references (e.g., `profiles:owner_id(...)` stays; but `sprints:sprint_id` → `ia_lab_sprints:sprint_id`)**

Run:
```bash
grep -rn --include="*.ts" --include="*.tsx" -E ":(sprint_id|use_case_id)\(" src/
```

For each match, check the preceding table hint and rename to the `ia_lab_*` equivalent. Example: `sprints:sprint_id(...)` → `ia_lab_sprints:sprint_id(...)`.

- [ ] **Step 5: Commit**

```bash
git add -u src/
git commit -m "refactor: rename project-hub table references to ia_lab_* across src/"
```

---

### Task 19: Replace `profile.department` → `profile.team`

**Files:**
- Modify: every file referencing `department`

- [ ] **Step 1: Enumerate and replace**

```bash
grep -rln --include="*.ts" --include="*.tsx" "\.department\b" src/
```

For each hit, verify it's a profile access (not something unrelated), then:

```bash
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.department\b/.team/g" {} +
```

- [ ] **Step 2: Verify and scan for any stray string literals**

```bash
grep -rn --include="*.ts" --include="*.tsx" "department" src/
```

If any remain (UI label strings, comments, etc.), update them to `team` or `équipe` as appropriate for UI French text.

- [ ] **Step 3: Verify TS compiles (more errors may surface)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Record the count — expect it to have DECREASED from Task 17.

- [ ] **Step 4: Commit**

```bash
git add -u src/
git commit -m "refactor: rename profile.department → profile.team across UI and data access"
```

---

### Task 20: Replace direct TJM reads with getEffectiveTjm

**Files:**
- Modify: every file doing arithmetic on `profile.tjm` or `consultant.tjm` (numbers in the old shape)

- [ ] **Step 1: Find all TJM reads**

```bash
grep -rn --include="*.ts" --include="*.tsx" -E "(profile|owner|consultant|member|user)\.(tjm|cjm)\b" src/
```

- [ ] **Step 2: For each hit, wrap in `getEffectiveTjm`/`getEffectiveCjm`**

Example transformation (before):

```typescript
const totalCost = profile.tjm * daysUsed
```

After:

```typescript
import { getEffectiveTjm } from '@/lib/stafftool/profiles'
const tjm = getEffectiveTjm(profile, new Date(sprintDate).getFullYear()) ?? 0
const totalCost = tjm * daysUsed
```

Do this for every hit — no sed shortcut since semantics differ by call site (which year to pick).

- [ ] **Step 3: Verify TS compiles**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: further decrease from Task 19.

- [ ] **Step 4: Commit**

```bash
git add -u src/
git commit -m "refactor: route TJM/CJM reads through getEffectiveTjm/getEffectiveCjm helpers"
```

---

### Task 21: Replace `profile.role === 'admin'|'member'|'viewer'` role checks

**Files:**
- Modify: every file gating UI on the old project-hub role enum

- [ ] **Step 1: Find role checks**

```bash
grep -rn --include="*.ts" --include="*.tsx" -E "\.role\s*===\s*['\"](admin|member|viewer)['\"]" src/
grep -rn --include="*.ts" --include="*.tsx" -E "role\s+IN\s*\(.*(admin|member|viewer)" src/
```

- [ ] **Step 2: For each hit, replace with an `hasIaLabRole` call**

Example — before (in a component):

```typescript
const canEdit = profile?.role === 'admin' || profile?.role === 'member'
```

After:

```typescript
import { hasIaLabRole } from '@/lib/ia-lab-roles'
const [canEdit, setCanEdit] = useState(false)
useEffect(() => { hasIaLabRole(['admin','member']).then(setCanEdit) }, [])
```

For admin-only gates, use `isIaLabAdmin()` instead.

- [ ] **Step 3: Also remove any remaining references to `UserRole`**

```bash
grep -rn --include="*.ts" --include="*.tsx" "UserRole" src/
```
Expected: empty after this task.

- [ ] **Step 4: Verify TS compiles clean**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: **0** (all compile errors resolved). If not, fix remaining sites individually.

- [ ] **Step 5: Commit**

```bash
git add -u src/
git commit -m "refactor(auth): gate UI on ia_lab_user_roles via hasIaLabRole helpers"
```

---

### Task 22: Update Supabase server + middleware role checks

**Files:**
- Modify: `src/lib/supabase/middleware.ts` if it does role checks (check first)
- Modify: any server component or route handler doing role-dependent reads

- [ ] **Step 1: Check for server-side role logic**

```bash
grep -rn --include="*.ts" --include="*.tsx" "supabase/server\|lib/supabase/server" src/ | head -10
grep -rn --include="*.ts" --include="*.tsx" -E "\.role\s*===\s*['\"](admin|member|viewer)['\"]" src/app/ src/lib/
```

- [ ] **Step 2: If server-side code reads `profile.role`, replace with an `ia_lab_user_roles` query**

Example — for server components needing a role check:

```typescript
// in a Server Component or route handler
import { createClient } from '@/lib/supabase/server'

async function getServerIaLabRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('ia_lab_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle<{ role: 'member' | 'admin' }>()
  return data?.role ?? null
}
```

- [ ] **Step 3: Verify compile still clean**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -u src/
git commit -m "refactor(auth): server-side role checks now hit ia_lab_user_roles"
```

---

### Task 23: Run the dev server and fix runtime fallout

**Files:**
- Modify: whatever breaks at runtime

- [ ] **Step 1: Set up env vars locally (if not already)**

Create `.env.local` (not committed; Task 29 adds `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://fflrtslsujuweggxylbd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmbHJ0c2xzdWp1d2VnZ3h5bGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMjU0NzksImV4cCI6MjA1NDgwMTQ3OX0.Ya8r8QrAtXXrzcNc6yGou0JHICkLCZkTJSmUkjP31B0
```

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: dev server up at `http://localhost:3000`.

**Prerequisite:** the migration `000_ia_lab_initial.sql` must have been applied (Phase 9). If not yet applied, queries will fail because `ia_lab_*` tables don't exist in prod. Skip this task until Phase 9 is done, or run it against a local Supabase instance if you have one.

- [ ] **Step 3: Click through key flows**

Go through:
- Login page — does `auth/callback` work?
- Backlog page — Kanban loads? Drag-drop works?
- Use case detail dialog — opens, fields populate?
- Gallery — published UCs visible?
- Sprints list — loads?
- Settings — profile tab is read-only (Task 25)?

Fix any runtime errors. Common fallout:
- Queries selecting old column names → update select lists
- Queries joining on old FK column names → update embeds
- Profile UI rendering `profile.role === 'admin'` style Badge → use `hasIaLabRole`

- [ ] **Step 4: Commit any runtime fixes**

```bash
git add -u src/
git commit -m "fix: runtime fallout from table/column renames"
```

---

## Phase 5 — Placeholder & profile-edit removal

### Task 24: Remove placeholder-profile creation path

**Files:**
- Modify: any component that creates/references `is_placeholder` profiles

- [ ] **Step 1: Find all placeholder references**

```bash
grep -rn --include="*.ts" --include="*.tsx" "is_placeholder" src/ scripts/
grep -rn --include="*.ts" --include="*.tsx" "placeholder" src/components/backlog/ src/app/\(dashboard\)/settings/ src/components/admin/ 2>/dev/null
```

- [ ] **Step 2: Remove the placeholder-creation UI**

In `src/components/backlog/create-use-case-dialog.tsx` (and any other placeholder-related component), delete the "create placeholder profile" code path. Replace the owner selector with one that only lists real stafftool consultants (use `searchProfiles()` from the wrapper).

- [ ] **Step 3: Remove `is_placeholder` filter logic**

Any `.eq('is_placeholder', false)` or similar filter — delete (column no longer exists). Any UI displaying "(Placeholder)" badge — delete.

- [ ] **Step 4: Verify TS compiles + visual check**

Run: `npx tsc --noEmit && npm run dev` and click through "Create UC" → owner picker should now query stafftool profiles.

- [ ] **Step 5: Commit**

```bash
git add -u src/
git commit -m "refactor: remove placeholder-profile logic; UC owners must exist in stafftool profiles"
```

---

### Task 25: Make the Settings Profile tab read-only

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read the current settings page**

```bash
head -100 "src/app/(dashboard)/settings/page.tsx"
```

- [ ] **Step 2: In the Profile tab section, disable all inputs + replace the Save button with a link out to stafftool's profile page**

Example transformation (simplified — adapt to actual structure):

Before:
```tsx
<Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
<Button onClick={handleSave}>Enregistrer</Button>
```

After:
```tsx
<Input value={fullName} disabled readOnly />
<a
  href="https://digi.stafftool.fr/profile"
  target="_blank"
  rel="noreferrer"
  className="text-sm text-primary underline"
>
  Modifier mon profil dans Stafftool ↗
</a>
```

Keep displaying the data (read-only) so the tab is still useful. Remove any `update profiles` Supabase calls from this file.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Profile tab shows name/email/team/TJM as read-only; "Modifier dans Stafftool" link is visible.

- [ ] **Step 4: Commit**

```bash
git add -u "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): make profile tab read-only; link out to stafftool for edits"
```

---

## Phase 6 — CSV import adaptation

### Task 26: Rewrite `scripts/import-airtable.ts`

**Files:**
- Modify: `scripts/import-airtable.ts` (full rewrite)

- [ ] **Step 1: Read the current script to understand the CSV → record mapping**

```bash
cat scripts/import-airtable.ts | head -100
```

Note the existing status/category/priority enum mappings — we keep those, just change the target table and owner resolution.

- [ ] **Step 2: Rewrite `scripts/import-airtable.ts`**

Replace the entire file with:

```typescript
// scripts/import-airtable.ts
// Imports the 5 Airtable CSV exports at repo root into ia_lab_use_cases on the shared Supabase.
// Maps owner names to stafftool profiles.id via fuzzy match; unmatched → owner_id NULL.
// Always runs --dry-run first against prod to preview the insert plan.
//
// Usage:
//   npx tsx scripts/import-airtable.ts --dry-run
//   npx tsx scripts/import-airtable.ts --confirm
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'node:fs/promises' // use a CSV parser — see comment below

// Config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const CONFIRM = args.has('--confirm')
if (!DRY_RUN && !CONFIRM) {
  console.error('Must pass --dry-run OR --confirm. Refusing to run against prod without explicit intent.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// --- CSV inputs ---
// Each CSV → target status on the imported UC
const CSV_TARGETS: Array<{ file: string; status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'abandoned' }> = [
  { file: 'BDD UCs livrés Airtable - 1 - A prioriser.csv', status: 'backlog' },
  { file: 'BDD UCs livrés Airtable - 2 - En cadrage.csv', status: 'todo' },
  { file: 'BDD UCs livrés Airtable - 3 - Conception (1).csv', status: 'in_progress' },
  { file: 'BDD UCs livrés Airtable - 4 - UCs Livrés.csv', status: 'done' },
  { file: 'BDD UCs livrés Airtable - 5 - Abandonnés.csv', status: 'abandoned' },
]

type Row = Record<string, string>

async function readCsv(file: string): Promise<Row[]> {
  const raw = await fs.readFile(path.resolve(file), 'utf-8')
  // Replace this minimal CSV parser with a real library if the data has quoted commas
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])) as Row
  })
}

const profileCache = new Map<string, string | null>()
async function resolveOwnerId(name: string): Promise<string | null> {
  if (!name.trim()) return null
  const key = name.trim().toLowerCase()
  if (profileCache.has(key)) return profileCache.get(key) ?? null
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .ilike('full_name', `%${name.trim()}%`)
    .limit(1)
  const id = (data && data[0]?.id) ?? null
  profileCache.set(key, id)
  return id
}

function normalizeCategory(raw: string): 'IMPACT' | 'LAB' | 'PRODUCT' {
  const v = raw.trim().toUpperCase()
  if (v === 'IMPACT' || v === 'LAB' || v === 'PRODUCT') return v
  return 'LAB' // sensible default
}

function normalizePriority(raw: string): 'low' | 'medium' | 'high' | 'critical' {
  const v = raw.trim().toLowerCase()
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v
  return 'medium'
}

interface Plan {
  title: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'abandoned'
  category: 'IMPACT' | 'LAB' | 'PRODUCT'
  priority: 'low' | 'medium' | 'high' | 'critical'
  owner_id: string | null
  owner_name_raw: string
  owner_resolved: boolean
}

async function buildPlan(): Promise<Plan[]> {
  const plans: Plan[] = []
  for (const { file, status } of CSV_TARGETS) {
    const rows = await readCsv(file)
    console.log(`${file}: ${rows.length} rows`)
    for (const row of rows) {
      const ownerName = row['Owner'] || row['Responsable'] || row['Propriétaire'] || ''
      const ownerId = await resolveOwnerId(ownerName)
      plans.push({
        title: row['Title'] || row['Titre'] || '(sans titre)',
        description: row['Description'] || '',
        status,
        category: normalizeCategory(row['Category'] || row['Catégorie'] || ''),
        priority: normalizePriority(row['Priority'] || row['Priorité'] || ''),
        owner_id: ownerId,
        owner_name_raw: ownerName,
        owner_resolved: ownerId !== null,
      })
    }
  }
  return plans
}

async function main() {
  const plans = await buildPlan()
  const unresolved = plans.filter((p) => !p.owner_resolved && p.owner_name_raw.trim())

  console.log('\n=== Import plan ===')
  console.log(`Total rows: ${plans.length}`)
  console.log(`With resolved owner: ${plans.length - unresolved.length}`)
  console.log(`With unresolved owner (→ owner_id NULL): ${unresolved.length}`)
  if (unresolved.length > 0) {
    console.log('\nUnresolved owner names:')
    const uniq = new Set(unresolved.map((p) => p.owner_name_raw))
    for (const n of uniq) console.log(`  - ${n}`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No rows written. Re-run with --confirm to apply.')
    return
  }

  console.log('\n[CONFIRM] Writing to ia_lab_use_cases...')
  for (const p of plans) {
    const { error } = await supabase.from('ia_lab_use_cases').insert({
      title: p.title,
      description: p.description,
      status: p.status,
      category: p.category,
      priority: p.priority,
      owner_id: p.owner_id,
    })
    // ON CONFLICT (title, category) — the DB's unique index handles idempotency;
    // we just log and continue on constraint violations.
    if (error && !error.message.includes('duplicate key')) {
      console.error('INSERT failed:', p.title, '→', error.message)
    }
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Note: the minimal CSV parser is intentional — the Airtable exports are simple. If the real data contains quoted fields with embedded commas, replace `readCsv` with a real library (e.g., `csv-parse`). Check the first CSV before running.

- [ ] **Step 3: Run the dry-run**

Run: `npx tsx scripts/import-airtable.ts --dry-run`
Expected: a summary of total rows, resolved vs unresolved owners, and a list of unmatched names. **No rows written.**

- [ ] **Step 4: Commit**

```bash
git add scripts/import-airtable.ts
git commit -m "refactor(scripts): rewrite import-airtable for ia_lab_use_cases with stafftool profile lookup + dry-run"
```

---

### Task 27: Delete fix-abandoned.ts (obsolete after consolidation)

**Files:**
- Delete: `scripts/fix-abandoned.ts`

- [ ] **Step 1: Confirm it's not used elsewhere**

Run: `grep -rn "fix-abandoned" . --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null`
Expected: only the file itself.

- [ ] **Step 2: Delete**

```bash
rm scripts/fix-abandoned.ts
```

Reason: it existed to patch a historical migration-ordering issue (adding `abandoned` to the old `use_case_status` enum). The consolidated migration ships the full enum from the start.

- [ ] **Step 3: Commit**

```bash
git add -u scripts/
git commit -m "chore: drop fix-abandoned.ts — obsolete after migration consolidation"
```

---

## Phase 7 — CI guard

### Task 28: Add GitHub Actions grep-guard

**Files:**
- Create: `.github/workflows/guard-stafftool-tables.yml`

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/guard-stafftool-tables.yml
# Fails the build if any .ts/.tsx file outside src/lib/stafftool/ accesses stafftool-owned tables.
# This enforces the read-only wrapper convention documented in the merge spec § 5.4.
name: Guard stafftool tables

on:
  pull_request:
  push:
    branches: [main]

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Grep for stafftool table access outside wrapper
        shell: bash
        run: |
          set -e
          FORBIDDEN_TABLES='profiles|missions|clients|cras|user_roles|mission_consultants|mission_expertises|mission_feedbacks|expenses|expertises|ressources|revenue_targets|consultants_targets|absences|teams'
          OFFENDERS=$(grep -rEn --include="*.ts" --include="*.tsx" \
            --exclude-dir=node_modules \
            --exclude-dir=.next \
            --exclude-dir="src/lib/stafftool" \
            "\.from\(['\"](\\b($FORBIDDEN_TABLES)\\b)['\"]" \
            src/ || true)

          if [ -n "$OFFENDERS" ]; then
            echo "❌ Direct stafftool table access found outside src/lib/stafftool/:"
            echo "$OFFENDERS"
            echo ""
            echo "Go through src/lib/stafftool/* instead. See docs/superpowers/specs/2026-04-24-stafftool-merge-design.md § 5.4."
            exit 1
          fi
          echo "✅ No direct stafftool table access outside the wrapper."
```

- [ ] **Step 2: Dry-run the grep locally to confirm it passes**

Run:
```bash
FORBIDDEN_TABLES='profiles|missions|clients|cras|user_roles|mission_consultants|mission_expertises|mission_feedbacks|expenses|expertises|ressources|revenue_targets|consultants_targets|absences|teams'
grep -rEn --include="*.ts" --include="*.tsx" --exclude-dir="src/lib/stafftool" "\.from\(['\"](\\b($FORBIDDEN_TABLES)\\b)['\"]" src/ || echo "OK: no offenders"
```
Expected: `OK: no offenders`. If offenders appear, move their access through the wrapper module.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/guard-stafftool-tables.yml
git commit -m "ci: grep-guard against direct stafftool table access outside wrapper"
```

---

## Phase 8 — Env + Vercel + docs

### Task 29: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create the file**

```
# .env.example
# Copy to .env.local and fill in. Both values are required.
# Get them from the stafftool Supabase project (prod):
#   https://fflrtslsujuweggxylbd.supabase.co
# Or ask someone with access to the Digilityx Supabase dashboard.

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example template"
```

---

### Task 30: Update README with merged-world deployment steps

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

```bash
cat README.md
```

- [ ] **Step 2: Replace README with merged-world content**

```markdown
# Project Hub — IA LAB

Internal Digilityx app for tracking IA Lab use cases through a Kanban pipeline, sprints, metrics, and a published gallery. Shares its Supabase backend with [stafftool](https://github.com/Digilityx/stafftool).

See [`docs/superpowers/specs/2026-04-24-stafftool-merge-design.md`](docs/superpowers/specs/2026-04-24-stafftool-merge-design.md) for the architecture.

## Getting started

```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (stafftool prod credentials)
npm run dev
```

Open http://localhost:3000.

## Important

- **Single environment (prod).** All work — local dev, PR previews, production — points at stafftool's prod Supabase. There is no dev/staging DB.
- **Test data convention:** prefix temporary UC titles with `[DEV]` so they're easy to identify and clean up.
- **Never write to stafftool-owned tables.** CI guard enforces this; RLS is the backstop. Use `src/lib/stafftool/*` for any read.
- **Schema changes** are applied manually via Supabase CLI or SQL editor. Vercel deploys code only.

## Scripts

```bash
npm run dev                # Dev server
npm run build              # Production build
npm run lint               # ESLint
npm run import:airtable    # Import Airtable CSVs — ALWAYS use --dry-run first:
                           # npx tsx scripts/import-airtable.ts --dry-run
                           # npx tsx scripts/import-airtable.ts --confirm
```

## Deployment

Deployed on Vercel from `main`. Preview deploys are auto-generated per PR (they also use prod credentials — see "Single environment" above).

Env vars set in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Related docs

- `CLAUDE.md` — conventions for AI-assisted work in this repo
- `SPECS.md` — product spec
- `PLAN.md` — pending UI features (post-merge)
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): update for merged-world setup and conventions"
```

---

### Task 31: Update CLAUDE.md to reflect merged world

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current CLAUDE.md**

```bash
cat CLAUDE.md
```

- [ ] **Step 2: Replace the sections that describe the old (standalone) data model**

Key updates:
- Remove all references to `profiles` being a project-hub-owned table
- Note the shared-DB setup with stafftool
- Document the wrapper pattern (`src/lib/stafftool/`)
- Update the "data" section to reflect `ia_lab_*` naming
- Replace `profile.role` mentions with `ia_lab_user_roles` + `hasIaLabRole`
- Remove `is_placeholder` mentions
- Note the single-env (prod) constraint and `[DEV]` prefix convention
- Note the CI grep-guard

Use the following section as a drop-in replacement for the `## Data` and `## Conventions` blocks of CLAUDE.md (merge/adapt with what's already there — don't delete everything):

```markdown
## Data

Project-hub shares stafftool's production Supabase DB (`fflrtslsujuweggxylbd`). Project-hub-owned tables use the `ia_lab_*` prefix; everything else is stafftool's.

- **Project-hub-owned (CRUD here):** `ia_lab_use_cases`, `ia_lab_sprints`, `ia_lab_tags`, `ia_lab_use_case_members`, `ia_lab_use_case_tags`, `ia_lab_use_case_metrics`, `ia_lab_use_case_documents`, `ia_lab_sprint_use_cases`, `ia_lab_sprint_use_case_assignments`, `ia_lab_uc_missions`, `ia_lab_uc_deals`, `ia_lab_uc_category_history`, `ia_lab_interest_requests`, `ia_lab_user_roles`.
- **Stafftool-owned (READ ONLY):** `profiles`, `missions`, `clients`, `cras`, `user_roles`, `mission_consultants`, `expenses`, `expertises`, etc. Access only through `src/lib/stafftool/*`. CI grep-guard blocks direct `.from('...')` calls outside the wrapper.
- **Enums:** all project-hub enums use the `ia_lab_` prefix (`ia_lab_role`, `ia_lab_sprint_status`, ...).

## Roles

Project-hub uses its own `ia_lab_user_roles` table (values: `member`, `admin`; absence = viewer). It is orthogonal to stafftool's own `profiles.role` (user category) and `user_roles` (stafftool permissions). Gate UI with `hasIaLabRole(['admin','member'])` from `src/lib/ia-lab-roles.ts`. Server code reads `ia_lab_user_roles` directly. RLS is the authority.

## Environment

Single env — prod. Local dev, PR previews, and production all point at the same Supabase. Prefix temp UC titles with `[DEV]` during dev/testing. Schema changes are applied manually via Supabase CLI, never by Vercel.

## Key files

- `src/lib/stafftool/` — the ONLY place allowed to read stafftool tables. Wrappers: `profiles.ts`, `missions.ts`. Types: `types.ts`.
- `src/lib/ia-lab-roles.ts` — `hasIaLabRole`, `isIaLabAdmin`, `getCurrentIaLabRole`.
- `src/types/database.ts` — shared `Profile` type (now reflects stafftool's schema: `team` not `department`, `tjm` JSONB year-keyed).
- `supabase/migrations/000_ia_lab_initial.sql` — the only migration; all `ia_lab_*` schema lives here.
- `scripts/import-airtable.ts` — CSV import. ALWAYS `--dry-run` first.
```

Merge these into the existing CLAUDE.md structure, replacing any outdated parts.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update CLAUDE.md for merged-world conventions"
```

---

## Phase 9 — Apply migration + verify (manual)

### Task 32: Obtain stafftool auth.users.id and patch the migration

**Files:**
- Modify: `supabase/migrations/000_ia_lab_initial.sql`

- [ ] **Step 1: Get your UID from Supabase dashboard**

Go to: https://supabase.com/dashboard/project/fflrtslsujuweggxylbd/auth/users → search for your Digilityx email → copy your `id` (a UUID).

- [ ] **Step 2: Replace the placeholder in the migration**

Open `supabase/migrations/000_ia_lab_initial.sql`, find `<YOUR_STAFFTOOL_AUTH_UID>`, replace with the UUID from step 1.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/000_ia_lab_initial.sql
git commit -m "chore(db): inject bootstrap admin UID into consolidated migration"
```

---

### Task 33: Run the pre-flight collision check against prod

**Files:** none (read-only)

- [ ] **Step 1: Open the Supabase SQL editor**

Navigate to https://supabase.com/dashboard/project/fflrtslsujuweggxylbd/sql/new (requires your Digilityx login).

- [ ] **Step 2: Paste and run `scripts/preflight-collision-check.sql`**

Expected: **zero rows returned**.

- [ ] **Step 3: If any row returns** — STOP, do not apply. Open an issue describing the collision and rename the conflicting object in the migration before retrying.

---

### Task 34: Apply the consolidated migration

**Files:** none (runs DDL)

- [ ] **Step 1: Apply via Supabase CLI (recommended) or SQL editor**

Option A (CLI — preferred, tracks history):
```bash
cd "C:/Users/enzor/OneDrive/Bureau/IA-LAB"
npx supabase link --project-ref fflrtslsujuweggxylbd
npx supabase db push
```

Option B (SQL editor): open `supabase/migrations/000_ia_lab_initial.sql` locally, copy contents, paste into the Supabase SQL editor, click Run.

- [ ] **Step 2: Run the post-apply verification**

In the Supabase SQL editor, paste and run `scripts/post-apply-verification.sql`.
Expected: every row shows "OK"; `bootstrap_status` = "OK: admin row present"; `admin_visible_missions` returns a non-zero count (all of stafftool's missions).

- [ ] **Step 3: If any verification check fails** — STOP. Read the error, fix the migration, optionally roll back with `DROP TABLE ia_lab_* CASCADE; DROP FUNCTION ia_lab_*; DROP TYPE ia_lab_*;`, then retry from Task 33.

---

### Task 35: Run CSV import and seed

**Files:** none (runs scripts)

- [ ] **Step 1: Dry-run the Airtable import**

```bash
npx tsx scripts/import-airtable.ts --dry-run
```
Expected: a summary of rows per CSV, resolved owner counts, unresolved owner names listed.

- [ ] **Step 2: Review unresolved owner names**

For each unresolved name, decide:
- Typo in the CSV → fix the CSV manually, re-dry-run.
- Real absent person → accept (UC will land with `owner_id = NULL`, assignable later).

- [ ] **Step 3: Run the confirmed import**

```bash
npx tsx scripts/import-airtable.ts --confirm
```
Expected: "Done." with no fatal errors. Duplicate-key errors are ok (idempotency is working).

- [ ] **Step 4: Apply the review seed**

In Supabase SQL editor, paste and run `supabase/seed_ia_lab_uc_review.sql`.
Expected: some `UPDATE` statements affect rows (check the Messages tab).

- [ ] **Step 5: Smoke-test the app against the populated DB**

```bash
npm run dev
```

Click through:
- Log in as yourself (the bootstrap admin).
- Backlog — kanban renders, UCs from CSV visible.
- Gallery — if any UCs were marked `is_published=true` (likely none from the CSV; may be empty).
- Create a test UC titled `[DEV] merge smoke test` — verify it saves.
- Delete the test UC — verify admin-only delete works.
- Try to link the test UC to a mission via the admin picker — verify `ia_lab_list_all_missions()` returns mission candidates.

- [ ] **Step 6: Commit (no code change, but the manual steps are complete)**

Nothing to commit — the migration was already committed in Task 32. This task just records completion.

---

## Self-review

**1. Spec coverage:**

- § 2 decision table → covered across Phase 1 (schema), Phase 4 (renames), Phase 6 (import), Phase 8 (Vercel), Phase 9 (apply).
- § 3 architecture diagram → reflected in Phase 1 (only `ia_lab_*` objects created) and Phase 8 (separate Vercel project).
- § 4 consolidated migration + FK policy + RPC → Tasks 2-7, 34.
- § 5 auth/roles/RLS/read-only → Tasks 5 (RLS), 16 (client role helper), 22 (server role helper), 28 (CI guard), 13-14 (wrapper).
- § 6 read surface → Tasks 13, 14 cover all wrapper reads; PostgREST embed syntax preserved in Task 18's rename (owner embeds already use `profiles!owner_id`).
- § 7 rollout → Phases 7-9.
- § 8 risks → mitigations baked in (Task 35 `[DEV]` prefix, Task 26 dry-run, Task 33 collision check).
- § 9 pre-launch checklist → Task 32 (UID), Task 33 (collision), Task 10-11 (the SQL scripts themselves); dev dump is a user-forwarded message outside this plan.
- § 10 deferred items → not implemented (as intended).
- § 11 FR dev message → already in the spec, not a code task.

One spec item missing → **I left "cover_image_url" out of the kanban/gallery-related code narrative** but it's on the schema (Task 3) so the feature works. No fix needed.

**2. Placeholder scan:**

- `<YOUR_STAFFTOOL_AUTH_UID>` in Task 7 — intentional, gated by Task 32 which fills it.
- No "TBD" / "TODO" / "implement later" / "similar to Task N" anywhere — verified by grep:
  ```bash
  grep -nE "TBD|TODO|implement later|fill in details|similar to Task" docs/superpowers/plans/2026-04-24-stafftool-merge.md
  ```
  (run this locally to confirm).

**3. Type consistency:**

- `hasIaLabRole(required: IaLabRole[])` — same signature in Task 16, called same way in Tasks 21 and 22.
- `getEffectiveTjm(profile, year)` — defined in Task 13 with `year?: number` default, used same way in Task 20.
- `StafftoolProfile` — defined in Task 12, used in Tasks 13, 14, 17 consistently.
- `searchProfiles` → used in Tasks 24 and 26 — same signature.

**4. Scope check:** One plan, ~35 focused tasks, internally coherent. Aligns with the spec's Approach A scope. Deferred items (SSO, custom domain, tests) are explicitly out.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-stafftool-merge.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for this plan because many tasks are independently testable (schema tasks, wrapper tasks, rename tasks).

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Good if you want to watch every step.

**Which approach?**
