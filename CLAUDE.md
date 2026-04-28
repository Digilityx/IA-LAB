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

No `vercel.json` / `vercel.ts` yet. `next.config.ts` is empty.

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
    (dashboard)/                        # dashboard shell + all authenticated pages
      backlog/                          # Kanban + list view + detail (pop-in)
      backlog/[id]/                     # direct-link detail page
      gallery/ + gallery/[id]/          # published UCs + interest dialog
      sprints/ + sprints/[id]/          # sprint planning + burndown
      metrics/                          # aggregated dashboards
      settings/                         # profile + admin CRUD (refonte planned)
    auth/callback/route.ts              # Supabase OAuth/magic-link callback
    auth/reset-password/                # password reset flow
  components/
    backlog/     gallery/     sprints/  layout/     ui/   # shadcn components
  hooks/         lib/supabase/     types/database.ts      middleware.ts
supabase/migrations/                    # 000_ia_lab_initial.sql — the only migration; never edit it, add 011_ia_lab_* for further changes
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
- Session gate: `src/middleware.ts` — every non-static route passes through `updateSession`.
- RLS is the source of truth. UI checks are for UX only — always assume the DB will reject the action too.
- Gate project-hub UI with `hasIaLabRole(['admin','member'])` from `src/lib/ia-lab-roles.ts`. Server code reads `ia_lab_user_roles` directly.

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
- `scripts/import-airtable.ts` reads the five `BDD UCs livrés Airtable - *.csv` files at repo root. Keep them UTF-8 — migration 006 exists specifically to undo mojibake from a past bad import.
- **Always run with `--dry-run` first**, then `--confirm` to apply.

---

## Current work (see `PLAN.md`)

Three features in progress:
1. **Liste view** toggle on `/backlog` (shadcn `table`).
2. **UC detail Sheet** — spec says Sheet; the current `use-case-detail-dialog.tsx` is a Dialog. Ask before deciding whether to rename to `-sheet.tsx` or redo.
3. **Settings refonte** — 4 tabs (Profil / Tags / Utilisateurs / Configuration).

Implementation order is spelled out at the bottom of `PLAN.md` — follow it unless the user says otherwise.

---

## When touching this project

- **Before writing code in a feature area, read `PLAN.md`** — some of it is already done (shadcn `table`/`alert-dialog` installed, `list-view.tsx` exists, detail is a Dialog not a Sheet). Check file state before following the plan blindly.
- **Never edit old migrations.** Add a new one (`011_*.sql` etc.).
- **Prefer editing existing files.** This repo has an established structure — don't add new top-level folders without a reason.
- **No tests exist yet.** Don't fabricate a test suite — if tests become relevant, ask first.
- **Don't push to `main`.** Open a PR for anything non-trivial.
- **French UI, English code.** Keep the separation.

## Data

Project-hub shares stafftool's production Supabase DB (`fflrtslsujuweggxylbd`). Project-hub-owned tables use the `ia_lab_*` prefix; everything else is stafftool's.

- **Project-hub-owned (CRUD here):** `ia_lab_use_cases`, `ia_lab_sprints`, `ia_lab_tags`, `ia_lab_use_case_members`, `ia_lab_use_case_tags`, `ia_lab_use_case_metrics`, `ia_lab_use_case_documents`, `ia_lab_sprint_use_cases`, `ia_lab_sprint_use_case_assignments`, `ia_lab_uc_missions`, `ia_lab_uc_deals`, `ia_lab_uc_category_history`, `ia_lab_interest_requests`, `ia_lab_user_roles`.
- **Stafftool-owned (READ ONLY):** `profiles`, `missions`, `clients`, `cras`, `user_roles`, `mission_consultants`, `expenses`, `expertises`, etc. Access only through `src/lib/stafftool/*`. CI grep-guard blocks direct `.from('...')` calls outside the wrapper.
- **Enums:** all project-hub enums use the `ia_lab_` prefix (`ia_lab_role`, `ia_lab_sprint_status`, ...).

## Roles

Project-hub uses its own `ia_lab_user_roles` table (values: `member`, `admin`; absence = viewer). It is orthogonal to stafftool's own `profiles.role` (user category) and `user_roles` (stafftool permissions). Gate UI with `hasIaLabRole(['admin','member'])` from `src/lib/ia-lab-roles.ts`. Server code reads `ia_lab_user_roles` directly. RLS is the authority.

## Environment

Single env — prod. Local dev, PR previews, and production all point at the same Supabase. Prefix temp UC titles with `[DEV]` during dev/testing. Schema changes are applied manually via Supabase CLI, never by Vercel.

- `.env*` is gitignored (except `.env.example`). Supabase keys live in `.env.local`. Copy from `.env.example` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Key files

- `src/lib/stafftool/` — the ONLY place allowed to read stafftool tables. Wrappers: `profiles.ts`, `missions.ts`. Types: `types.ts`.
- `src/lib/ia-lab-roles.ts` — `hasIaLabRole`, `isIaLabAdmin`, `getCurrentIaLabRole`.
- `src/types/database.ts` — shared `Profile` type (reflects stafftool's schema: `team` not `department`, `tjm` JSONB year-keyed).
- `supabase/migrations/000_ia_lab_initial.sql` — the only migration; all `ia_lab_*` schema lives here.
- `scripts/import-airtable.ts` — CSV import. ALWAYS `--dry-run` first.
