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
npm run import:airtable  # tsx scripts/import-airtable.ts — imports the 5 CSVs at repo root
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
supabase/migrations/                    # 001 → 010, never edit old migrations
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
- RLS is the source of truth. UI checks (`profile.role === 'admin'`) are for UX only — always assume the DB will reject the action too.
- Placeholder profiles: `is_placeholder = true`. Only admins may delete them. Regular users can't be deleted from the UI.

### Types
- Single source: `src/types/database.ts`. Joined fields (`owner?`, `sprint?`, `members?`, `tags?`, `metrics?`) are optional — guard them.
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

## Environment

- `.env*` is gitignored. Supabase keys live in `.env.local` (not in the repo). When the user runs `npm run dev` locally, they need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set.
- Not deployed on Vercel yet (no `.vercel/`, no `vercel.json`/`vercel.ts`). If deployment comes up, ask whether to configure it.
