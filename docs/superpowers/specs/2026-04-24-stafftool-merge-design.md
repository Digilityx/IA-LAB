# Stafftool ↔ Project Hub merge — design

**Date:** 2026-04-24
**Status:** Design approved; implementation plan to follow
**Owner:** EnzoPezlo
**Related:** [`SPECS.md`](../../../SPECS.md), [`CLAUDE.md`](../../../CLAUDE.md), [`PLAN.md`](../../../PLAN.md)

---

## 1. Context

**Project Hub** (this repo, `Digilityx/IA-LAB`) is a Next.js 16 + Supabase internal app for tracking IA Lab use cases through a Kanban pipeline, sprints, metrics and a published gallery. It is **pre-production** (no live data; the 5 Airtable CSVs at repo root are ready to import, and migrations 001–010 have never been applied to a production database).

**Stafftool** (`Digilityx/stafftool`) is Digilityx's **production** internal app for tracking consultants' activity, timesheets (CRA), missions, clients, expenses and company KPIs. It is a Vite + React 18 + Supabase SPA, deployed on Vercel at `digi.stafftool.fr`, with real users. Stafftool has two Supabase projects — a dev/preprod one (`czwuvdzigpqotktwygji`, stale) and production (`fflrtslsujuweggxylbd`).

The two apps already have **conceptual overlap** — stafftool's user identity (what it calls "consultants") is literally a `profiles` row keyed on `auth.users.id`; project-hub has its own `profiles` table with largely the same meaning. Rather than duplicate user data across two separately-hosted databases, we're merging both apps onto a **single shared Supabase backend** (stafftool production), while keeping the frontends as two independent Vercel deployments.

### Goals

1. Project-hub and stafftool share a single user record per person — no duplication.
2. Project-hub can optionally link a use case to a stafftool mission, to enable future cross-app features (mission ↔ UC visibility, revenue attribution).
3. The merge introduces **zero changes** to stafftool's schema, RLS, triggers, or code.
4. Project-hub never writes to stafftool-owned tables.

### Non-goals (deferred)

- Shared session / SSO across the two apps. Each app has its own login; users log in separately with the same credentials.
- Mandatory mission ↔ UC linking. Stays optional.
- Stafftool reading project-hub data in its UI. Policies allow it; no feature is built in this merge.
- PLAN.md's three features (list view, detail Sheet, Settings refonte) — a separate project, post-merge.
- Testing infrastructure.

---

## 2. Decision table

| Decision | Choice |
|---|---|
| Codebase strategy | Separate repos, independent Vercel projects |
| Shared Supabase | Stafftool **production** (`fflrtslsujuweggxylbd`) |
| Environment strategy | Only prod env for project-hub (no dev/staging) |
| Write rule | Project-hub never writes to stafftool-owned tables; RLS + code discipline enforce |
| User table | Shared `profiles` (stafftool-owned). Keyed on `auth.users.id`. |
| Placeholder users | Dropped. Every UC owner/member must exist in `profiles`. |
| Project-hub roles | New project-hub-owned `ia_lab_user_roles` table |
| Role enum | `ia_lab_role = ('member', 'admin')`. Absence of a row = viewer. |
| UC → mission link | Nullable `mission_id` FK on `ia_lab_use_cases`; only IA Lab admins link |
| FK `ON DELETE` (profiles) | `SET NULL` on `owner_id` (which becomes nullable) |
| FK `ON DELETE` (missions) | `SET NULL` on `mission_id` |
| Table / enum naming | `ia_lab_*` prefix across all tables, types, and functions owned by project-hub |
| Migration strategy | Scrap 001–010, write one consolidated `000_ia_lab_initial.sql` |
| Mission visibility for admins | `SECURITY DEFINER` RPC `ia_lab_list_all_missions()` owned by project-hub |
| Project-hub URL | Vercel-generated for v1, custom Digilityx domain later |
| Deployment | Vercel (both apps, independent projects) |

---

## 3. Architecture

```
                  ┌──────────────────────────────────────────┐
                  │          Supabase (stafftool prod)       │
                  │    fflrtslsujuweggxylbd.supabase.co      │
                  │                                          │
                  │  auth.users       ← shared               │
                  │  profiles         ← stafftool-owned,     │
                  │                     shared (read-only    │
                  │                     from project-hub)    │
                  │  missions, clients, cras, user_roles,    │
                  │  mission_consultants, ...                │
                  │                   ← stafftool-owned,     │
                  │                     read-only from PH    │
                  │                                          │
                  │  ia_lab_use_cases, ia_lab_sprints,       │
                  │  ia_lab_tags, ia_lab_use_case_metrics,   │
                  │  ia_lab_uc_missions, ia_lab_uc_deals,    │
                  │  ia_lab_user_roles, ...                  │
                  │                   ← project-hub-owned,   │
                  │                     full CRUD            │
                  └─────────────┬────────────────┬───────────┘
                                ▲                ▲
                         anon   │                │   anon
                         key    │  RLS enforced  │    key
                                │                │
               ┌────────────────┴───┐  ┌─────────┴──────────────┐
               │  stafftool (Vite)  │  │  project-hub (Next.js) │
               │  Vercel            │  │  Vercel (new project)  │
               │  digi.stafftool.fr │  │  URL: Vercel-generated │
               │  React 18 · Bun    │  │  React 19 · npm        │
               │  localStorage auth │  │  @supabase/ssr cookies │
               └────────────────────┘  └────────────────────────┘
```

### Key properties

- **Shared `auth.users`** — identical credentials work in both apps; sessions remain per-app (SSO deferred).
- **Shared `profiles`** — one row per person, owned by stafftool. Project-hub reads only.
- **Ownership encoded in naming, not grants** — Supabase's anon/authenticated roles can't label writes by app. Enforcement is (a) code convention (grep-guarded in CI), (b) RLS as last-line defense.
- **Project-hub's tables live alongside stafftool's** in the `public` schema, with `ia_lab_*` prefixes for visibility.
- **Two independent Vercel projects.** Separate env vars, separate deploy pipelines.

---

## 4. Data model reconciliation

Project-hub is pre-production and has no live data to preserve. The **10 existing migrations (001–010)** were designed for a standalone database and have accumulated deviations (notably, migration 002 dropped the `profiles.id → auth.users.id` FK to enable placeholder profiles — a concept we're removing).

**We scrap 001–010** and write one consolidated migration: `supabase/migrations/000_ia_lab_initial.sql`. The old migrations are deleted from the repo. The consolidated migration is designed from day one for the shared Supabase context.

### What the consolidated migration contains

1. **Enums**, all prefixed to avoid collision with stafftool:
   - `ia_lab_role` (`'member', 'admin'`)
   - `ia_lab_sprint_status`, `ia_lab_use_case_status` (incl. `abandoned`), `ia_lab_use_case_category`, `ia_lab_priority_level`, `ia_lab_member_role`, `ia_lab_interest_type`, `ia_lab_interest_status`
   - **No** `user_role` enum — project-hub's role system lives in `ia_lab_user_roles` instead.

2. **Project-hub tables** (renamed with the `ia_lab_*` prefix convention):
   - `ia_lab_sprints`, `ia_lab_use_cases`, `ia_lab_use_case_members`, `ia_lab_tags`, `ia_lab_use_case_tags`, `ia_lab_use_case_metrics`, `ia_lab_use_case_documents`, `ia_lab_sprint_use_cases`, `ia_lab_sprint_use_case_assignments`, `ia_lab_uc_missions`, `ia_lab_uc_deals`, `ia_lab_uc_category_history`, `ia_lab_interest_requests`.
   - `ia_lab_use_cases.owner_id` is **nullable** (per Q5b, `SET NULL` on profile delete).
   - `ia_lab_use_cases.mission_id UUID NULL REFERENCES missions(id) ON DELETE SET NULL` — the only inbound FK into stafftool territory.

3. **`ia_lab_user_roles`** — new table:

   ```sql
   CREATE TABLE ia_lab_user_roles (
     user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     role        ia_lab_role NOT NULL,
     granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     granted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
     notes       TEXT
   );
   ```

   Bootstrapped with a hardcoded INSERT for the first admin (user's `auth.users.id`, collected pre-launch).

4. **FKs to `profiles(id)`** — kept as-is. Since `profiles.id = auth.users.id` in stafftool, they resolve correctly against the shared table.

5. **RLS policies** — every policy that historically checked `profile.role` is rewritten to call the helper function below.

6. **Role helper function:**

   ```sql
   CREATE FUNCTION has_ia_lab_role(required_roles ia_lab_role[])
   RETURNS BOOLEAN
   LANGUAGE sql SECURITY DEFINER STABLE
   SET search_path = public
   AS $$
     SELECT EXISTS (
       SELECT 1 FROM ia_lab_user_roles
       WHERE user_id = auth.uid() AND role = ANY(required_roles)
     );
   $$;
   ```

   Used across ~20 policies. If the role model evolves, one function change updates the whole app's authorization.

7. **Mission visibility for admins (SECURITY DEFINER RPC):**

   ```sql
   CREATE FUNCTION ia_lab_list_all_missions()
   RETURNS TABLE (
     id UUID, label TEXT, type TEXT, client_id UUID, start_date DATE, end_date DATE
   )
   LANGUAGE sql SECURITY DEFINER STABLE
   SET search_path = public
   AS $$
     SELECT m.id, m.label, m.type, m.client_id, m.start_date, m.end_date
     FROM missions m
     WHERE has_ia_lab_role(ARRAY['admin']::ia_lab_role[]);
   $$;

   REVOKE ALL ON FUNCTION ia_lab_list_all_missions() FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION ia_lab_list_all_missions() TO authenticated;
   ```

   Gate is *inside* the function body: non-admins get an empty set. Column list is whitelisted in `RETURNS TABLE(...)` — tighter than a bare SELECT.

8. **`update_updated_at` trigger function** — named `ia_lab_update_updated_at()` to avoid collision with anything stafftool may have. Attached to `ia_lab_use_cases` and `ia_lab_use_case_metrics` only.

### What the migration explicitly does NOT do

- No `DROP` / `ALTER` / `COMMENT ON` against any stafftool-owned object.
- No RLS changes to `profiles`, `missions`, or any stafftool table.
- No new columns, indexes, or triggers on stafftool tables.
- No schema or extension changes.

The only cross-app surface is **inbound FKs** from `ia_lab_use_cases` to `profiles(id)` and `missions(id)`. Postgres-wise, inbound FKs don't structurally modify the target tables; they affect `ON DELETE` behavior on the target side, which we've set to `SET NULL` so stafftool admin delete operations succeed cleanly.

---

## 5. Auth, roles, and access

### 5.1 Shared `auth.users`

Users log in to each app separately (no SSO in v1) but with the same credentials. `auth.uid()` resolves to the same UUID in both apps. `profiles.id` and all project-hub user-FKs reference this UUID.

### 5.2 Role system

Project-hub's roles are **orthogonal** to everything stafftool has. Stafftool actually has **two** role-ish concepts on its side:

1. **`profiles.role`** (TEXT, single value per user, e.g. `"consultant"`) — a *user category*, not a permission grant. Think of it as the person's professional role inside the company.
2. **`user_roles`** (separate table, values like `admin`, `manager`) — actual permission grants used in RLS.

Project-hub touches neither. We add a **third** system, `ia_lab_user_roles`, entirely in our domain and managed from project-hub's Settings UI.

| `ia_lab_user_roles.role` | Capabilities in project-hub |
|---|---|
| `admin` | Full CRUD on all IA Lab entities; delete UCs; manage tags; grant/revoke IA Lab roles; link UCs to missions |
| `member` | Create/update UCs, sprints, metrics; cannot delete UCs; cannot manage roles |
| _(no row)_ | Viewer — browse the gallery, send interest requests, read aggregated metrics |

Bootstrap: the consolidated migration ends with `INSERT INTO ia_lab_user_roles (user_id, role) VALUES ('<your-auth-uid>', 'admin');` — the first admin, collected pre-launch.

### 5.3 RLS rewrite pattern

Every project-hub policy that previously read `profiles.role` now reads `has_ia_lab_role(...)`:

```sql
-- Example: UC create policy
CREATE POLICY "Members can create use cases" ON ia_lab_use_cases
  FOR INSERT TO authenticated
  WITH CHECK ( has_ia_lab_role(ARRAY['member','admin']::ia_lab_role[]) );

-- Example: UC delete policy
CREATE POLICY "Admins can delete use cases" ON ia_lab_use_cases
  FOR DELETE TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );
```

Read policies stay `TO authenticated USING (true)` so stafftool can trivially add cross-app reads in the future.

### 5.4 Read-only enforcement on stafftool tables

Three overlapping guarantees:

1. **Typed wrapper layer** (`src/lib/stafftool/`) — the only place in project-hub allowed to reference stafftool tables. Exposes read-only functions: `getProfile()`, `listProfilesByIds()`, `searchProfiles()`, `getEffectiveTjm()`, `getMission()`, `searchMissions()`, `listAllMissionsForAdmin()` (which calls the RPC). No wrapper is named anything like `insert`, `update`, or `delete`.
2. **CI grep-guard** — a CI step fails the build if any `.ts` file outside `src/lib/stafftool/` contains `.from('profiles'|'missions'|'clients'|'cras'|'user_roles'|'mission_consultants'|'expenses'|'expertises'|'mission_feedbacks'|'absences'|…)`. Reviewers don't have to remember the rule.
3. **RLS as last line of defense** — stafftool's existing RLS policies continue to apply; an accidental write from project-hub would be rejected unless the user is also a stafftool admin (an acceptable residual risk for an internal tool).

### 5.5 TJM/CJM handling

Stafftool stores `tjm` and `cjm` on `profiles` as **year-keyed JSONB** — confirmed from both the `20241205_convert_tjm_cjm_to_jsonb.sql` migration comment and a live probe: `{"2024": 800, "2025": 800, "2026": 800}`. **`src/lib/stafftool/profiles.ts`** owns `getEffectiveTjm(profile, year?: number)` and `getEffectiveCjm(profile, year?: number)` helpers (year defaults to current). Everywhere else in project-hub sees `number | null`. If a new year's rate doesn't exist on a profile, the helper returns the nearest prior year's rate (or `null` if none).

---

## 6. Cross-app data reads

### 6.1 Read surface (project-hub → stafftool)

| Stafftool table | Columns read | Usage | Frequency |
|---|---|---|---|
| `profiles` | `id`, `full_name`, `email`, `avatar_url`, `team`, `tjm`, `cjm`, `role`, `arrival_date`, `departure_date` | UC owner/member cards, kanban, list view, detail Sheet, sprint assignees, gallery, Settings → Utilisateurs, metrics attribution | Every page with UC or sprint data |
| `missions` | `id`, `label`, `type`, `client_id` (+ `clients(name)` embed), `start_date`, `end_date` | Linked mission display on UC detail; admin "link mission" picker | On-demand |
| `clients`, `cras`, `mission_consultants`, `user_roles`, `expenses`, `expertises`, `absences` | — | Not read in v1 | — |

### 6.2 Read mechanics

**Explicit wrappers** (`src/lib/stafftool/*`) for standalone lookups.

**PostgREST embed syntax** for join-style reads on UC pages (both tables live in the same Postgres, so no extra round-trip):

```ts
supabase
  .from('ia_lab_use_cases')
  .select(`
    *,
    owner:profiles!owner_id(id, full_name, avatar_url, team),
    mission:missions!mission_id(id, label, type, client:clients(name))
  `)
```

### 6.3 RLS visibility — the one known constraint

Stafftool's `missions` RLS (from `20240720_fix_missions_rls.sql`) restricts `SELECT` to stafftool admins/managers, a mission's `manager_id`/`responsable_id`, or consultants assigned via `mission_consultants`. A regular IA Lab member wouldn't see arbitrary missions.

**Consequence:** the "link UC to mission" action is **IA Lab admin only** (matches reality — 3–4 admins). Admins use `ia_lab_list_all_missions()` (SECURITY DEFINER RPC) to see every mission. Non-admins don't see the link button.

Profiles has no equivalent restriction (stafftool code reads all profiles freely), so owner/member pickers work for everyone.

---

## 7. Rollout

### 7.1 Vercel setup

- New Vercel project linked to `Digilityx/IA-LAB` GitHub repo.
- Framework auto-detected: Next.js 16 App Router. No `vercel.json` required.
- Auto-deploys from `main`. Preview deploys auto-generated per PR.
- **Caveat accepted**: preview deploys point at prod Supabase (only-prod-env decision).

### 7.2 Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://fflrtslsujuweggxylbd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<stafftool prod anon key>
```

Set in Vercel for Production, Preview, and Development. Mirror to `.env.local` locally. Commit a `.env.example` template. The anon key is safe to expose; RLS is the security boundary.

### 7.3 Pre-flight collision check

Run against stafftool prod before applying the migration. Must return zero rows:

```sql
-- Type collisions
SELECT 'TYPE: ' || typname FROM pg_type
WHERE typname IN ('ia_lab_role','ia_lab_sprint_status','ia_lab_use_case_status',
                  'ia_lab_use_case_category','ia_lab_priority_level',
                  'ia_lab_member_role','ia_lab_interest_type','ia_lab_interest_status');

-- Table collisions
SELECT 'TABLE: ' || tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'ia_lab_%';

-- Function collisions
SELECT 'FUNCTION: ' || proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND proname IN ('has_ia_lab_role','ia_lab_list_all_missions','ia_lab_update_updated_at');
```

If any row appears → rename before applying.

### 7.4 Migration execution

Schema is applied **manually** via Supabase CLI (`supabase db push`) or SQL editor — **never** by Vercel. Vercel deploys code only. Rationale: separation of concerns and accident-proofing.

**Migration history interplay.** Supabase tracks applied migrations in `supabase_migrations.schema_migrations` on each database. Both project-hub and stafftool will be pushing migrations into the same DB from separate repos, which means either repo's `supabase db push` sees migrations applied by the other. This is fine — the CLI is idempotent against its history — but two conventions keep it clean:

1. **Filename disambiguation** — project-hub's migration is `000_ia_lab_initial.sql`; any future project-hub migrations carry an `ia_lab_` prefix (`011_ia_lab_add_X.sql`). Stafftool keeps its own date-prefixed format. No filename collision possible.
2. **Never run `supabase db reset` against prod from either repo** — it would rebuild schema from only that repo's migrations and drop the other side's objects. This is already a taboo for stafftool prod; we adopt the same rule on project-hub side.

Rollback is a single script: `DROP TABLE ia_lab_* CASCADE; DROP FUNCTION ia_lab_*; DROP TYPE ia_lab_*;`. Since nothing stafftool-owned was touched, teardown is trivial.

### 7.5 CSV import adaptation

Rewrite `scripts/import-airtable.ts`:

1. **Name → `profiles.id` lookup** via `src/lib/stafftool/profiles.ts::searchProfiles(fullName)`. Exact match preferred; fuzzy match (normalized whitespace/accents) accepted. Unknown names → `owner_id = NULL` (now legal per Q5b). Script reports unmapped names for manual fix-up.
2. **Idempotency** — unique constraint `(title, category)` on `ia_lab_use_cases` + `ON CONFLICT DO NOTHING`. Safe to re-run.
3. **Dry-run flag** (`--dry-run`) prints the insert plan without writing. Given only-prod-env, **always dry-run first**.
4. Adapted `supabase/seed_uc_review.sql` (renamed to `supabase/seed_ia_lab_uc_review.sql`, table renames applied) runs after CSV import.

### 7.6 Only-prod-env safety nets

- Destructive scripts (import, seed) require `--confirm` to execute against prod.
- Dev experiments seed with `[DEV] ` title prefix → identifiable and cleanable.
- CI grep-guard on stafftool table access (Section 5.4 #2).
- No automatic migration application. Schema changes are manual and reviewed.

### 7.7 Rollout sequence

1. This spec is committed.
2. Previous dev provides a DB dump (optional; if unobtainable, we proceed with the CSVs).
3. Complete pre-launch checklist (§ 9) — get stafftool auth UID, verify `profiles` columns, verify `missions` columns.
4. Author `000_ia_lab_initial.sql`.
5. Run pre-flight collision check → must be clean.
6. Apply migration via Supabase CLI.
7. Create Vercel project, set env vars, deploy `main`.
8. Sanity check: login flow, RLS denies non-admins, IA Lab admin can CUD, mission RPC returns rows for admin.
9. Import previous dev's dump if obtainable.
10. Run adapted CSV import: `--dry-run` → review → real run.
11. Run `seed_ia_lab_uc_review.sql`.
12. IA Lab admins go live.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Preview deploys write to prod DB | Certain | Low-medium | `[DEV]` prefix convention, `--confirm` on destructive scripts, CI grep-guard |
| Stafftool admin deletes a profile with UC ownership | Low | Low | `SET NULL` on `owner_id`; UI renders "Ancien propriétaire" gracefully |
| TJM JSONB shape | ~~unknown~~ **verified year-keyed** via live probe | — | Runtime shape guard in `getEffectiveTjm` still included as belt-and-suspenders |
| `missions` columns | ~~assumed~~ **inferred from source + partially verified** | Low | Appendix A3; RPC column whitelist uses only confirmed fields; re-verify at migration time |
| Stafftool schema drift breaks our wrappers | Low | Medium | `src/lib/stafftool/*` is single blast zone; trivially patchable |
| Previous dev's local data lost if no dump | Medium | Low-medium | Instructions provided; CSVs are canonical anyway |
| Stafftool's corrupted `types.ts` | N/A to us | N/A | We define our own types in `src/lib/stafftool/types.ts`; flag to stafftool team |
| Name collision with stafftool's existing types/tables/functions | Low | Low | Pre-flight collision check gates the apply step |

---

## 9. Pre-launch checklist

- [ ] **Stafftool `auth.users.id` for bootstrap admin.** Get from Supabase dashboard → Authentication → Users, search for your email. *Still needed from user.*
- [x] **`profiles` column list.** Verified via live probe against prod (anon role can read). See Appendix § A2.
- [x] **TJM / CJM JSONB shape.** Verified year-keyed, e.g. `{"2024": 800, "2025": 800, "2026": 800}`.
- [ ] **`missions` column list.** Partially verified from stafftool source code grep; confirmed fields: `id`, `label`, `type`, `client_id`, `manager_id`, `responsable_id`, `start_date`, `end_date`, `pipeline_budget`, `signed_budget`, `total_budget`, `created_at`. Full schema needs auth to verify; RPC column whitelist (§ 4 #7) only uses confirmed fields. *Good enough to proceed; re-confirm at migration time.*
- [ ] **Previous dev's DB dump** (optional). French message ready to forward (§ 11). *User to contact previous dev.*
- [ ] **Pre-flight collision check** (§ 7.3) passes clean. *Runs against prod at migration time; `ia_lab_*` prefix keeps collision risk extremely low.*

---

## 10. Deferred / backlog items

- **SSO across apps.** Approach B from brainstorm. Both apps on a shared parent domain (e.g. `hub.stafftool.fr`) with unified Supabase auth storage.
- **Custom domain for project-hub.** Replace Vercel-generated URL with Digilityx-owned subdomain.
- **Dev / staging environment** for project-hub.
- **Stafftool reading IA Lab data.** UCs on consultant profile page; UC KPIs on dashboard; linked UCs on mission detail. Policies already permit; feature work not included.
- **Mandatory mission ↔ UC linking** if a future feature requires it.
- **PLAN.md features** (Liste view toggle, detail Sheet, Settings refonte) — separate project post-merge.
- **Profile editing in project-hub.** Stafftool owns user data; edits happen in stafftool.
- **Testing infrastructure** for project-hub.

---

## 11. Instructions pour le dev précédent (DB dump)

Message à transférer tel quel (le dev précédent est francophone).

> Salut — est-ce que tu pourrais m'envoyer un dump de ta base IA-LAB locale ? C'est pour préserver les données que tu as ajoutées par-dessus l'import Airtable avant qu'on merge dans la base de stafftool. N'importe laquelle de ces options fonctionne :
>
> **Option 1 — tu utilisais Supabase en local (le plus probable).** Dans le dossier du repo IA-LAB, lance :
> ```bash
> supabase db dump -f ialab_dump.sql
> ```
> Si ça râle en disant que ce n'est pas lié, lance `supabase db dump --local -f ialab_dump.sql` à la place. Envoie-moi le fichier `ialab_dump.sql`.
>
> **Option 2 — tu utilisais un projet Supabase distant.** Sur le dashboard Supabase → Database → Backups → "Scheduled backups" → télécharge la plus récente. OU lance `supabase db dump --linked -f ialab_dump.sql` après un `supabase link`.
>
> **Option 3 — tu ne sais pas du tout.** Ouvre Claude Code dans ton dossier IA-LAB et colle ce prompt :
> ```
> J'ai besoin d'exporter ma base de données locale dans un unique fichier SQL pour qu'une autre personne puisse l'importer. Vérifie si je tourne Supabase en local (avec `supabase status`) ou si je suis lié à un projet distant (regarde `.env.local` ou `supabase/config.toml`), puis lance la bonne commande `supabase db dump` pour produire `ialab_dump.sql` à la racine du repo. Ne touche pas à la base, fais juste le dump.
> ```
>
> Si rien de tout ça ne marche, au pire : zippe tout le dossier IA-LAB y compris `.env.local` (il contient l'URL/clé de ton Supabase) et envoie-le-moi — je récupérerai les données moi-même.

---

## Appendix — Stafftool inspection notes

Gathered 2026-04-23/24 from `C:/Users/enzor/OneDrive/Bureau/stafftool/` (latest pull) and a live PostgREST probe against stafftool prod using the public anon key.

### A1. Stack & deployment

**Stack:** Vite + React 18.2 + TS + shadcn + Tailwind 3 + Bun. Originally scaffolded via Lovable.dev. `@supabase/supabase-js` 2.49 — client-only, localStorage sessions.

**Deployment:** Prod `digi.stafftool.fr` (Vercel); preprod `activitysync-toolbox.vercel.app`; both on Vercel (not GitHub Pages despite `has_pages: true` on the repo).

**Supabase projects:**
- Prod: `fflrtslsujuweggxylbd` — target of this merge
- Dev/preprod: `czwuvdzigpqotktwygji` — noted as stale, not used here

### A2. `profiles` — verified columns (live probe)

Reading a real row from prod via `GET /rest/v1/profiles?limit=1&select=*` with the public anon key succeeds — stafftool's RLS on `profiles` allows anon SELECT. Full column list:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (FK `auth.users.id`) | PK |
| `email` | TEXT | |
| `full_name` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |
| `team` | TEXT | e.g. `"marketing"` — **NOT** `department` |
| `seniority` | TEXT / numeric | nullable |
| `holidays_current_year` | NUMERIC | |
| `holidays_previous_year` | NUMERIC | |
| `holidays_two_years_ago` | NUMERIC | |
| `rtt` | NUMERIC | RTT balance |
| `arrival_date` | DATE | |
| `departure_date` | DATE | nullable |
| `avatar_url` | TEXT | Supabase Storage public URL |
| `managed` | — | nullable; semantics unclear |
| `expertises` | JSONB | shape `{ expertises: [{ id, name, grade }] }` — potentially useful for future UC skill matching |
| `can_access_feature` | BOOLEAN | feature flag |
| `role` | TEXT | e.g. `"consultant"` — user category, NOT a permission grant |
| `slack_id` | TEXT | nullable |
| `tjm` | JSONB | year-keyed: `{"2024": 800, "2025": 800, "2026": 800}` |
| `cjm` | JSONB | year-keyed, same shape |

### A3. `missions` — columns inferred from source code

Live probe returns `[]` (RLS denies anon — see § 6.3). From grepping stafftool's `src/`:

| Column | Type | Evidence |
|---|---|---|
| `id` | UUID | PK, used everywhere |
| `label` | TEXT | `.select('id, label, ...')` in Activities, Expertises, CRA, Missions pages |
| `type` | TEXT | `.select('id, label, clients (name), type')` in Activities |
| `client_id` | UUID (FK `clients.id`) | embeds via `clients:client_id(...)` |
| `manager_id` | UUID (FK `profiles.id`) | mission RLS policy |
| `responsable_id` | UUID (FK `profiles.id`) | mission RLS policy |
| `start_date`, `end_date` | DATE | year filter in `useMissionsData` |
| `pipeline_budget`, `signed_budget`, `total_budget` | NUMERIC | MissionDetailsDialog |
| `created_at` | TIMESTAMPTZ | ordering |

### A4. Other relevant tables (names only, inferred from source and SQL files)

`mission_consultants` (M2M profile ↔ mission with `daily_rate`, `monthly_days`, `status`), `mission_expertises`, `mission_feedbacks`, `clients`, `cras` (timesheets, key column `mission_consultant_id`), `expenses`, `expertises`, `ressources`, `user_roles`, `revenue_targets`, `consultants_targets`, `absences`, `teams`.

### A5. Stafftool repo quirks (not ours to fix, flag to stafftool team)

- `src/integrations/supabase/types.ts` is corrupted — contains stray `Need to install the following packages:` CLI output from an earlier accidental `npx supabase ... > types.ts` redirection.
- Hardcoded Supabase URLs + anon keys in `src/integrations/supabase/client.ts` instead of env vars.
- `profiles` is readable by anon role — surprising for prod, but given the data is non-sensitive directory info (names, team, TJM) and consistent with stafftool needing unauthenticated pre-login lookups, probably intentional.

---

*End of design.*
