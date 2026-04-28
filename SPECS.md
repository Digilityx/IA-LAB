# Project Hub — Specs

Internal management platform for the Digilityx **IA LAB**. Tracks AI use cases (UCs) from idea to delivery, through sprints, with shared metrics and a published gallery.

---

## 1. Vision

One source of truth for every AI use case at Digilityx:
- where it is in the pipeline,
- who owns it and who contributes,
- how many man-days it cost vs. what it generated (margin, MRR, saved days),
- and — once delivered — a gallery so consultants can discover reusable UCs and trigger interest requests.

The product is French-facing (internal tool). Status/category/priority labels stay in French in the UI.

---

## 2. Personas & roles

| Role | Capabilities |
|---|---|
| **admin** | Full CRUD on all entities. Can delete UCs. Manages users, tags, configuration. |
| **member** | Create/update UCs, sprints, members, tags, metrics. Cannot delete UCs. |
| **viewer** | Read-only. Uses the Gallery; can send interest requests. |

RLS is enforced at the database level on every table — the UI enforces the same rules defensively.

---

## 3. Features

### 3.1 Authentication
- Supabase email/password + OAuth via `@supabase/ssr`.
- Session middleware (`src/middleware.ts` → `updateSession`).
- User identity is managed by stafftool — `profiles` rows are created by stafftool's `handle_new_user` trigger when a user signs up through either app.
- Password reset flow at `/auth/reset-password`.

### 3.2 Backlog (Kanban + Liste)
- **Kanban** — columns per `use_case_status`, drag-drop via `@dnd-kit`, card shows title / category / priority / owner avatar / tags / sprint.
- **Liste** (per `PLAN.md`) — table with sortable columns (Titre, Statut, Catégorie, Priorité, Responsable, Tags, Sprint, Mis à jour). Client-side sort.
- **Toggle** Kanban ↔ Liste in the filter bar.
- **Detail pop-in** (`use-case-detail-sheet.tsx`, planned — currently a Dialog): 4 tabs
  1. **Détails** — status / category / priority selects, description, documentation (markdown).
  2. **Infos** — deliverable_type, usage_type, tools, target_users, benchmark_url, journey_url.
  3. **Membres** — owner + contributors (read-only).
  4. **Métriques** — margin, MRR, man-days estimated/actual/saved (generated column), additional business, notes.
- **Direct URL** `/backlog/[id]` still works for deep-linking.
- **Deletion** — admin only, guarded by `AlertDialog`.

### 3.3 Sprints
- 23-day budget (`SPRINT_BUDGET_DAYS = 23`) — surfaced in UI.
- Multi-assignee per UC within a sprint (`ia_lab_sprint_use_case_assignments`).
- Burndown chart (Recharts).
- Statuses: `planned` / `active` / `completed`.
- Admin-only deletion (RLS enforced).

### 3.4 Gallery
- Lists UCs with `is_published = true`.
- Cards show cover image, short description.
- **Interest requests** — `interested` / `want_to_use` / `propose_to_client`. Status lifecycle: `pending` → `contacted` → `resolved`. Read/archive flags. Owner + admins can update status.

### 3.5 Metrics
- Aggregates across delivered UCs:
  - Margin generated, MRR, total man-days saved, additional business.
  - Missions (`ia_lab_uc_missions`): client, consultant, TJM snapshot, days saved.
  - Deals (`ia_lab_uc_deals`): client, amount, quote date.
- Category history (`ia_lab_uc_category_history`) — audit trail when a UC's category changes.

### 3.6 Settings (refonte planifiée — 4 onglets)
1. **Profil** — name, email, team (read-only display; edit link to stafftool).
2. **Tags** — inline-editable table (name, color picker). AlertDialog on delete (removes from all UCs).
3. **Utilisateurs** — table with IA Lab role inline-editable (writes `ia_lab_user_roles`); team displayed read-only.
4. **Configuration** — read-only reference for PG enums (statuses, categories, priorities, colors). Adding values requires a new SQL migration.

### 3.7 Data import
- **Initial import (one-shot, done):** `scripts/transform-dump.ts` consumed the previous dev's `ialab_dump.sql`, mapped 19/21 dev-local profile UUIDs to stafftool prod profiles by name, and produced `.transformed_dump.sql` (411 INSERTs, FK-ordered, idempotent via `ON CONFLICT DO NOTHING`). Applied via Supabase SQL editor.
- **CSV import (fallback, available):** `scripts/import-airtable.ts` (run via `npm run import:airtable`) ingests the 5 CSVs at repo root (prioriser / cadrage / conception / livrés / abandonnés). Always `--dry-run` before `--confirm`. Note: when run with the anon key alone, RLS blocks writes — the script is intended for future imports by an authenticated admin user (or via a service-role escalation if needed).

---

## 4. Data model

### Core entities

Project-hub-owned tables use the `ia_lab_*` prefix. Stafftool-owned tables (`profiles`, `missions`, `clients`, etc.) are read-only via `src/lib/stafftool/*` wrappers.

| Table | Purpose | Key fields |
|---|---|---|
| `profiles` | Extends `auth.users` — **stafftool-owned, read-only from project-hub** | `role`, `team`, `tjm` (year-keyed JSONB), `cjm` |
| `ia_lab_user_roles` | Project-hub role grants (orthogonal to stafftool roles) | `user_id`, `role` (`member`/`admin`), `granted_at`, `granted_by` |
| `ia_lab_sprints` | Delivery sprints | `start_date`, `end_date`, `status` |
| `ia_lab_use_cases` | Central entity | `status`, `category`, `priority`, `sprint_id`, `owner_id` (nullable), `mission_id` (nullable, FK→stafftool `missions`), `is_published`, `documentation`, `cover_image_url`, `deliverable_type`, `usage_type`, `tools`, `target_users`, `benchmark_url`, `journey_url`, `next_steps`, `transfer_status` |
| `ia_lab_use_case_members` | Team per UC | `role` (`owner`/`contributor`/`reviewer`) |
| `ia_lab_tags` + `ia_lab_use_case_tags` | Free-form labels | `color` (hex) |
| `ia_lab_use_case_metrics` | 1:1 with UC | `margin_generated`, `mrr`, `man_days_*`, `additional_business`, `notes` — `man_days_saved` is a **generated column** (`estimated - actual`); never write to it |
| `ia_lab_use_case_documents` | Attachments | `file_url`, `file_size` |
| `ia_lab_sprint_use_cases` + `ia_lab_sprint_use_case_assignments` | Sprint planning, multi-assignee | `estimated_days` per assignment |
| `ia_lab_uc_missions` | Revenue attribution | `consultant_id`, `mission_client`, `days_saved`, `mission_amount`, `tjm_snapshot` |
| `ia_lab_uc_deals` | Client deals | `client`, `amount`, `quote_date` |
| `ia_lab_uc_category_history` | Audit log (append-only) | `old_category`, `new_category`, `changed_by`, `changed_at` |
| `ia_lab_interest_requests` | Gallery demand signals | `type`, `status`, `is_read`, `is_archived` |

### Enums (PostgreSQL — not editable at runtime; all `ia_lab_*` prefixed)
- `ia_lab_role` — `member` / `admin` (absence of a row in `ia_lab_user_roles` = viewer)
- `ia_lab_sprint_status` — `planned` / `active` / `completed`
- `ia_lab_use_case_status` — `backlog` / `todo` / `in_progress` / `done` / `abandoned`
- `ia_lab_use_case_category` — `IMPACT` / `LAB` / `PRODUCT`
- `ia_lab_priority_level` — `low` / `medium` / `high` / `critical`
- `ia_lab_member_role` — `owner` / `contributor` / `reviewer`
- `ia_lab_interest_type` — `interested` / `want_to_use` / `propose_to_client`
- `ia_lab_interest_status` — `pending` / `contacted` / `resolved`

### Triggers and helper functions
- `handle_new_user` — stafftool-owned trigger that auto-creates a `profiles` row on `auth.users` insert (used by both apps).
- `ia_lab_update_updated_at` — bumps `updated_at` on `ia_lab_use_cases` and `ia_lab_use_case_metrics`.
- `has_ia_lab_role(roles[])` — `SECURITY DEFINER` helper called by every project-hub RLS policy.
- `ia_lab_list_all_missions()` — `SECURITY DEFINER` RPC letting IA Lab admins see all stafftool missions despite stafftool's `missions` RLS (gate is inside the function body; non-admins get an empty set).

---

## 5. Permissions matrix (enforced via RLS)

| Action | admin | member | viewer |
|---|---|---|---|
| Read UCs / profiles / tags / metrics | ✅ | ✅ | ✅ |
| Create / update UCs, sprints, tags, metrics | ✅ | ✅ | ❌ |
| Delete UC | ✅ | ❌ | ❌ |
| Create interest request | ✅ | ✅ | ✅ (`auth.uid() = requester_id`) |
| Update interest request status | ✅ | UC owner only | ❌ |

---

## 6. Non-functional

- **Language** — UI French; code English; SQL comments mixed.
- **Tenant** — single-tenant (no multi-org support).
- **Browser** — desktop-first; responsive not a goal for v1.
- **Security** — RLS is the source of truth. Never trust client-side role checks alone. CI grep-guard (`.github/workflows/guard-stafftool-tables.yml`) blocks direct `.from('<stafftool table>')` outside `src/lib/stafftool/`.
- **Encoding** — keep CSV imports UTF-8. The consolidated migration sets `client_encoding = 'UTF8'`.

---

## 7. Roadmap

### Done
- ✅ **Stafftool merge** (Approach A from `docs/superpowers/specs/2026-04-24-stafftool-merge-design.md`): shared Supabase, `ia_lab_*` schema, read-only stafftool wrappers, orthogonal roles, CI grep-guard.
- ✅ **Initial deploy** to Vercel under personal scope (`enzos-projects-32aade38/ia-lab`) at `https://ia-lab-five.vercel.app`.

### Next up (see `PLAN.md`)
- [ ] Backlog **liste view** + Kanban/List toggle.
- [ ] UC **detail Sheet** replacing the Dialog (currently `use-case-detail-dialog.tsx`).
- [ ] **Settings refonte** — 4 tabs (Profil / Tags / Utilisateurs / Configuration).

### Operational follow-ups
- [ ] Get Digilityx GitHub admin to authorize Vercel for `Digilityx/IA-LAB`, then transfer Vercel project from personal scope to Digilityx team to unlock auto-deploy on push.
- [ ] Add `https://ia-lab-five.vercel.app/**` to Supabase auth Redirect URLs (one-time UI step).
- [ ] Next 16 deprecation: rename `src/middleware.ts` → `src/proxy.ts` (cosmetic).

### Known open questions
- Adding a new enum value requires a SQL migration. No runtime config path yet.
- No audit log on `ia_lab_user_roles` changes.
- Gallery has no filters/search beyond what's already coded — revisit if the number of published UCs grows.

---

## 8. Glossary (FR)

- **UC** — Use Case.
- **Backlog** — the Kanban board itself (not just the leftmost column).
- **Sprint** — 23-day delivery window.
- **IMPACT / LAB / PRODUCT** — the three UC categories driving how a UC is tracked (client revenue / internal R&D / productized asset).
- **TJM** — Taux Journalier Moyen (daily billing rate).
