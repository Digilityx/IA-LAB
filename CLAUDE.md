# CLAUDE.md

Guidance for Claude Code when working in this repo. See `SPECS.md` for the product spec and `PLAN.md` for active work.

---

## What this is

**Project Hub** — internal Next.js app for Digilityx's IA LAB to manage AI use cases (UCs) through a Kanban pipeline, sprints, metrics, and a published gallery. Single-tenant, French UI, Supabase backend with RLS.

## Stack (pinned versions matter — don't auto-upgrade without asking)

- **Next.js 16.1.6** (App Router) + **React 19.2.3** + TS strict
- **Tailwind v4** + **shadcn** (style: `new-york`, base: `neutral`, icons: `lucide`)
- **Supabase** — `@supabase/ssr` 0.8 + `@supabase/supabase-js` 2.97
- **@dnd-kit** for Kanban drag-drop
- **Zod 4**, **Recharts**, **Sonner** (toasts), **date-fns**, **react-markdown**

No `vercel.json` / `vercel.ts`. `next.config.ts` is empty.

## Deployment

Live at **https://ia-lab-five.vercel.app** (personal Vercel scope `enzos-projects-32aade38/ia-lab` — temporary; transferring to Digilityx team once GitHub auto-connect permission is granted).

**Auto-deploy is NOT wired up yet** — the Vercel project isn't connected to the GitHub repo. Every prod release is manual:

```bash
git pull origin main
vercel --prod
```

Pushing to `main` does NOT trigger a deploy on its own.

## Scripts

```bash
npm run dev              # next dev
npm run build            # next build
npm run lint             # eslint
npm run import:airtable  # tsx scripts/import-airtable.ts — ALWAYS use --dry-run first:
                         # npx tsx scripts/import-airtable.ts --dry-run
                         # npx tsx scripts/import-airtable.ts --confirm
```

## Project layout

```
src/
  app/
    (auth)/login/                       # login page (route group, no layout chrome)
    (dashboard)/                        # dashboard shell — async server component, role-gated
      backlog/                          # Kanban + list view + detail (pop-in) + admin/non-admin button swap
      backlog/[id]/                     # direct-link detail page
      gallery/ + gallery/[id]/          # published UCs + interest dialog
      sprints/ + sprints/[id]/          # sprint planning + burndown
      metrics/                          # aggregated dashboards (admin-only)
      settings/                         # profile + admin CRUD (refonte planned, admin-only)
    auth/callback/route.ts              # Supabase OAuth/magic-link callback
    auth/reset-password/                # password reset flow
  components/
    backlog/     gallery/     sprints/  layout/     ui/   # shadcn components
  hooks/         lib/supabase/     types/database.ts      middleware.ts
supabase/migrations/                    # 000_ia_lab_initial.sql + 011_ia_lab_documents_bucket.sql + 012_ia_lab_use_case_submissions.sql.
                                        # Never edit a committed migration after it has been applied — add a new 013_ia_lab_*.sql, etc.
scripts/                                # Airtable import, ad-hoc fixes
```

Path alias: `@/*` → `./src/*`.

## Conventions

### Supabase client boundaries
- **Server components / route handlers** → `src/lib/supabase/server.ts`
- **Client components** → `src/lib/supabase/client.ts`
- **Middleware** → `src/lib/supabase/middleware.ts` (session refresh)

Don't import the server client in a client component or vice-versa.

### Auth & authorization
- Session gate: `src/middleware.ts` — every non-static route passes through `updateSession` (which lives in `src/lib/supabase/middleware.ts`).
- `updateSession` injects `x-pathname` into the **request** headers via `NextResponse.next({ request: { headers: ... } })` so server components can read it via `headers()`. Setting it on the response is a silent footgun — don't do it.
- RLS is the source of truth. UI checks are for UX only — always assume the DB will reject the action too.
- **Page-level role gating** is in `src/app/(dashboard)/layout.tsx` (server component): reads role via `getCurrentIaLabRoleServer` (`src/lib/ia-lab-roles-server.ts`), reads pathname via `headers()`, and redirects non-admins to `/backlog` when on an admin-only path. Admin-only paths defined in `src/lib/ia-lab-routes.ts` (`dashboardRoutes` array + `isAdminOnlyPath()` helper) — single source of truth, also consumed by `Sidebar` to filter visible nav items.
- Client-side: gate UI with `hasIaLabRole(['admin','member'])` from `src/lib/ia-lab-roles.ts`, or use the `useIaLabRole()` hook (`src/hooks/use-ia-lab-role.ts`) for components that conditionally render admin-only controls.
- Server-side Supabase reads use `getCurrentIaLabRoleServer()` from `src/lib/ia-lab-roles-server.ts`.

### Types
- Single source: `src/types/database.ts`. Joined fields (`owner?`, `sprint?`, `members?`, `tags?`, `metrics?`) are optional — guard them.
- `Profile` type reflects stafftool's schema: `team` (not `department`), `tjm` is a year-keyed JSONB object — use `getEffectiveTjm` to extract the value for a given year.
- `SPRINT_BUDGET_DAYS = 23` is a hard constant, not configurable.
- `use_case_metrics.man_days_saved` is a **generated column** (`estimated - actual`). Never write to it.

### Enums are PostgreSQL types
Statuses, categories, priorities, roles are enforced as PG enums. Adding a value = a new migration. If a task asks for a new status, flag it and propose a migration — don't try to "patch" it at runtime.

### UI language
- Labels, columns, button text, confirmation dialogs → **French**.
- Identifiers / props / component names → English.
- Match existing French terminology in `PLAN.md` (Titre, Statut, Catégorie, Priorité, Responsable, Mis à jour, Enregistrer, Supprimer…).

### shadcn components
- Already installed: `alert-dialog`, `avatar`, `badge`, `button`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `scroll-area`, `select`, `separator`, `sheet`, `table`, `tabs`, `textarea`, `tooltip`.
- Install new ones via `npx shadcn@latest add <name>` (not `shadcn-ui`). The CLI lives in devDependencies.
- Style is `new-york` / `neutral` — don't change these without the user's OK.

### ESLint
- `react-hooks/set-state-in-effect` is **off** project-wide — client-side Supabase fetches in `useEffect` are the established pattern here. Don't reintroduce the rule.

### Data imports
- **Initial data was imported from `ialab_dump.sql`** (the previous dev's full DB export, committed at repo root) via `scripts/transform-dump.ts` → `.transformed_dump.sql` → Supabase SQL editor. Re-running is idempotent (`ON CONFLICT DO NOTHING`) but rarely needed.
- **CSV import (`scripts/import-airtable.ts`)** reads the five `BDD UCs livrés Airtable - *.csv` files at repo root. Always `--dry-run` first, then `--confirm`. Caveat: with the anon key alone, RLS rejects writes — script needs an authenticated admin context (or service-role key passed via env) to insert.
- Keep CSV files UTF-8.

---

## Recently shipped (2026-04-30, deployed)

- **Documents bucket fix** (migration `011_ia_lab_documents_bucket.sql`): private `documents` Storage bucket + RLS on `storage.objects`; UC detail dialog stores storage paths and downloads via signed URLs; uploads now surface errors instead of silently swallowing them.
- **UC submission flow + role-based page gating** (migration `012_ia_lab_use_case_submissions.sql`):
  - Non-admins see only `/backlog`, `/sprints`, `/gallery`. The "Nouveau use case" button becomes "Soumettre un use case" with a 3-field popin (Titre / Description / Type d'utilisation). Submissions appear in a "Vos demandes" section above the Kanban with edit/delete on pending rows.
  - Admins triage from the dashboard widget (renamed "Dernières demandes" — was "Dernières demandes d'intérêt"), which now mixes interest requests + pending submissions sorted by `created_at`.
  - Clicking a submission row opens `CreateUseCaseDialog` in **approval mode** (prefilled fields, submitter strip, Approuver / Rejeter buttons replacing Créer). Reject opens an `AlertDialog` requiring a reason.
  - Approve/reject UPDATEs are conditional on `status = 'pending'` to handle two-admin races; on lost race the just-INSERTed UC is rolled back.

## Current work (see `PLAN.md`)

Three older features still pending:
1. **Liste view** toggle on `/backlog` (shadcn `table`) — `list-view.tsx` exists; polish + filters not done.
2. **UC detail Sheet** — spec says Sheet; the current `use-case-detail-dialog.tsx` is a Dialog. Ask before deciding whether to rename to `-sheet.tsx` or redo.
3. **Settings refonte** — 4 tabs (Profil / Tags / Utilisateurs / Configuration).

Implementation order is spelled out at the bottom of `PLAN.md` — follow it unless the user says otherwise. Read file state before following the plan; some pieces (shadcn `table`/`alert-dialog` installed, `list-view.tsx` exists) are partially done.

## Known bugs to handle next

- **Métriques mission bug**: opening the Métriques tab on a UC detail and clicking "Ajouter une mission" (IMPACT or LAB) errors silently with `toast.error("Erreur lors de l'ajout")`. Source: `src/components/backlog/use-case-gains-panel.tsx:94-106`. The error isn't logged. Capture the exact toast text + DevTools network response, then debug systematically — probably RLS on `ia_lab_uc_missions` or the post-insert join.

---

## When touching this project

- **Before writing code in a feature area, read `PLAN.md`** — some of it is already done (shadcn `table`/`alert-dialog` installed, `list-view.tsx` exists, detail is a Dialog not a Sheet). Check file state before following the plan blindly.
- **Never edit `000_ia_lab_initial.sql`** — it has been applied to prod. Add new migrations as `011_ia_lab_*.sql`, `012_ia_lab_*.sql`, etc.
- **Prefer editing existing files.** This repo has an established structure — don't add new top-level folders without a reason.
- **No tests exist yet.** Don't fabricate a test suite — if tests become relevant, ask first.
- **Manual deploy.** Currently no auto-deploy from `main` (see Deployment section). After merging changes, run `vercel --prod` to release.
- **French UI, English code.** Keep the separation.

## Data

Project-hub shares stafftool's production Supabase DB (`fflrtslsujuweggxylbd`). Project-hub-owned tables use the `ia_lab_*` prefix; everything else is stafftool's.

- **Project-hub-owned (CRUD here):** `ia_lab_use_cases`, `ia_lab_use_case_submissions`, `ia_lab_sprints`, `ia_lab_tags`, `ia_lab_use_case_members`, `ia_lab_use_case_tags`, `ia_lab_use_case_metrics`, `ia_lab_use_case_documents`, `ia_lab_sprint_use_cases`, `ia_lab_sprint_use_case_assignments`, `ia_lab_uc_missions`, `ia_lab_uc_deals`, `ia_lab_uc_category_history`, `ia_lab_interest_requests`, `ia_lab_user_roles`.
- **Project-hub-owned Storage:** `documents` bucket (private; member/admin write; signed URLs for read).
- **Stafftool-owned (READ ONLY):** `profiles`, `missions`, `clients`, `cras`, `user_roles`, `mission_consultants`, `expenses`, `expertises`, etc. Access only through `src/lib/stafftool/*`. CI grep-guard blocks direct `.from('...')` calls outside the wrapper.
- **Stafftool-owned Storage (do not touch):** `rexfiles`, `clients` buckets.
- **Enums:** all project-hub enums use the `ia_lab_` prefix (`ia_lab_role`, `ia_lab_sprint_status`, `ia_lab_submission_status`, ...).

## Roles

Project-hub uses its own `ia_lab_user_roles` table (values: `member`, `admin`; absence = viewer). It is orthogonal to stafftool's own `profiles.role` (user category) and `user_roles` (stafftool permissions).

- **Admins** access every page. Use the full "Nouveau use case" creation popin. Triage submissions + interest requests from the dashboard widget.
- **Members** see only `/backlog`, `/sprints`, `/gallery`. Cannot create UCs directly — they submit a 3-field proposal (`ia_lab_use_case_submissions`) that an admin must approve.
- **Viewers** (no row in `ia_lab_user_roles`): read-only on the gallery; can send interest requests.

Gate client UI with `hasIaLabRole(['admin','member'])` (`src/lib/ia-lab-roles.ts`) or `useIaLabRole()` (`src/hooks/use-ia-lab-role.ts`). Server code uses `getCurrentIaLabRoleServer()` (`src/lib/ia-lab-roles-server.ts`). Page-level redirect lives in `(dashboard)/layout.tsx`. RLS is the authority.

## Environment

Single env — prod. Local dev, PR previews, and production all point at the same Supabase. Prefix temp UC titles with `[DEV]` during dev/testing. Schema changes are applied manually via Supabase CLI, never by Vercel.

- `.env*` is gitignored (except `.env.example`). Supabase keys live in `.env.local`. Copy from `.env.example` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Key files

- `src/lib/stafftool/` — the ONLY place allowed to read stafftool tables. Wrappers: `profiles.ts`, `missions.ts`. Types: `types.ts`.
- `src/lib/ia-lab-roles.ts` — client-side: `hasIaLabRole`, `isIaLabAdmin`, `getCurrentIaLabRole`.
- `src/lib/ia-lab-roles-server.ts` — server-side: `getCurrentIaLabRoleServer` (used by `(dashboard)/layout.tsx`).
- `src/lib/ia-lab-routes.ts` — `dashboardRoutes` (sidebar nav source of truth) + `isAdminOnlyPath()`.
- `src/hooks/use-ia-lab-role.ts` — client React hook for conditional UI.
- `src/types/database.ts` — shared `Profile` type (reflects stafftool's schema: `team` not `department`, `tjm` JSONB year-keyed); also `UseCaseSubmission`, `SubmissionStatus`.
- `supabase/migrations/000_ia_lab_initial.sql` — initial schema (14 `ia_lab_*` tables, RLS, helper functions). Applied to prod.
- `supabase/migrations/011_ia_lab_documents_bucket.sql` — private `documents` Storage bucket + RLS policies. Applied 2026-04-30.
- `supabase/migrations/012_ia_lab_use_case_submissions.sql` — submission table + column-guard trigger. Applied 2026-04-30.
- `scripts/import-airtable.ts` — CSV import. ALWAYS `--dry-run` first.

## Spec / plan archive

- `docs/superpowers/specs/2026-04-24-stafftool-merge-design.md` + `docs/superpowers/plans/2026-04-24-stafftool-merge.md` — stafftool merge.
- `docs/superpowers/specs/2026-04-30-submission-flow-and-role-gating-design.md` + `docs/superpowers/plans/2026-04-30-submission-flow-and-role-gating.md` — submission flow + role gating.
