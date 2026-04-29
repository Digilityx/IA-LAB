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

| Role | Capabilities | Pages visible |
|---|---|---|
| **admin** | Full CRUD on all entities. Creates UCs directly. Approves/rejects member submissions. Manages users, tags, configuration. | All — Dashboard, Backlog, Sprints, Métriques, Galerie, Paramètres |
| **member** | Updates UCs they're on, sprints, members, tags, metrics. **Cannot create UCs directly** — submits a 3-field proposal that an admin reviews. Cannot delete UCs. | Backlog, Sprints, Galerie |
| **viewer** | Read-only. Uses the Gallery; can send interest requests. | Galerie |

RLS is enforced at the database level on every table — the UI enforces the same rules defensively. Page-level redirect for non-admins is centralized in `src/app/(dashboard)/layout.tsx` consuming `src/lib/ia-lab-routes.ts`.

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
- **Top-right button is role-aware**: admins see "Nouveau use case" → opens the full `CreateUseCaseDialog`. Members see "Soumettre un use case" → opens `SubmitUseCaseDialog` (3-field).
- **"Vos demandes" section** (members only, above the filter bar) — shows the current user's pending + recently-rejected (≤30 days) submissions. Pending rows have edit/delete buttons; rejected rows display the rejection reason inline.
- **Detail pop-in** (`use-case-detail-sheet.tsx`, planned — currently a Dialog): 4 tabs
  1. **Détails** — status / category / priority selects, description, documentation (markdown).
  2. **Infos** — deliverable_type, usage_type, tools, target_users, benchmark_url, journey_url.
  3. **Membres** — owner + contributors (read-only).
  4. **Métriques** — margin, MRR, man-days estimated/actual/saved (generated column), additional business, notes.
  5. **Documents** — file uploads stored in the private `documents` Supabase Storage bucket; downloads via 1-hour signed URLs.
- **Direct URL** `/backlog/[id]` still works for deep-linking.
- **Deletion** — admin only, guarded by `AlertDialog`.

### 3.2.b UC submission flow

Members submit lightweight UC proposals; admins promote them into real UCs.

- **Submit (member):** `SubmitUseCaseDialog` — 3 fields (Titre / Description / Type d'utilisation). On submit → row in `ia_lab_use_case_submissions` with `status = 'pending'`. Toast: "Demande envoyée — en attente de validation".
- **Edit (member):** while `status = 'pending'`, the submitter can re-open the dialog from "Vos demandes" and update title / description / usage_type. RLS + a column-guard trigger prevent mutating review/status columns from this path.
- **Triage (admin):** the dashboard "Dernières demandes" widget mixes submissions with gallery interest requests, sorted by `created_at`, capped at 10. A small `Inbox` icon distinguishes submissions.
- **Approve (admin):** clicking a submission row opens `CreateUseCaseDialog` in **approval mode** — title swaps to "Approuver une demande", a submitter strip is shown, and the bottom buttons become Approuver / Rejeter. Approuver INSERTs a real UC, then `UPDATE ia_lab_use_case_submissions SET status='approved', approved_use_case_id=... WHERE id=$1 AND status='pending'`. If the conditional UPDATE returns zero rows (lost a race to another admin), the just-INSERTed UC is rolled back and the admin sees "Demande déjà traitée par un autre administrateur".
- **Reject (admin):** Rejeter opens an `AlertDialog` requiring a non-empty reason. The conditional UPDATE writes `status='rejected', rejection_reason=...`. The submitter sees the reason in their "Vos demandes / Refusées" section.
- **Retention:** rejected rows persist in the DB indefinitely (audit). The "Vos demandes" UI hides rejected rows older than 30 days via a query filter.

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
| `ia_lab_use_case_documents` | Attachments — `file_url` stores a **storage path** (not a URL); files served via signed URLs from the private `documents` bucket | `file_url`, `file_size` |
| `ia_lab_use_case_submissions` | Lightweight UC proposals from members. Admins approve (→ creates `ia_lab_use_cases` row + sets `approved_use_case_id`) or reject with reason. Column-guard trigger prevents non-admins from mutating `status` / `reviewed_*` / `approved_use_case_id` / `rejection_reason` / `submitted_by`. | `submitted_by`, `status`, `rejection_reason`, `approved_use_case_id`, `reviewed_by`, `reviewed_at` |
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
- `ia_lab_submission_status` — `pending` / `approved` / `rejected`

### Triggers and helper functions
- `handle_new_user` — stafftool-owned trigger that auto-creates a `profiles` row on `auth.users` insert (used by both apps).
- `ia_lab_update_updated_at` — bumps `updated_at` on `ia_lab_use_cases` and `ia_lab_use_case_metrics`.
- `ia_lab_submissions_guard_columns` — BEFORE UPDATE trigger on `ia_lab_use_case_submissions`. Raises an exception if a non-admin attempts to mutate review/status columns; bumps `updated_at`.
- `has_ia_lab_role(roles[])` — `SECURITY DEFINER` helper called by every project-hub RLS policy.
- `ia_lab_list_all_missions()` — `SECURITY DEFINER` RPC letting IA Lab admins see all stafftool missions despite stafftool's `missions` RLS (gate is inside the function body; non-admins get an empty set).

### Storage buckets
- `documents` — project-hub-owned, **private**. Files served via 1-hour signed URLs. RLS on `storage.objects` scoped by `bucket_id = 'documents'`: read for any authenticated user; insert/update/delete for member or admin (via `has_ia_lab_role`). `ia_lab_use_case_documents.file_url` stores the **storage path**, not a URL.
- `rexfiles`, `clients` — stafftool-owned. Do not touch.

---

## 5. Permissions matrix (enforced via RLS)

| Action | admin | member | viewer |
|---|---|---|---|
| Read UCs / profiles / tags / metrics | ✅ | ✅ | ✅ |
| Create UC (direct) | ✅ | ❌ — must submit | ❌ |
| Submit UC proposal | ✅ | ✅ | ❌ |
| Read submissions | ✅ all | ✅ own only | ❌ |
| Edit own pending submission | ✅ | ✅ | ❌ |
| Approve / reject submission | ✅ | ❌ | ❌ |
| Update UCs, sprints, tags, metrics | ✅ | ✅ | ❌ |
| Delete UC | ✅ | ❌ | ❌ |
| Upload to `documents` bucket | ✅ | ✅ | ❌ |
| Create interest request | ✅ | ✅ | ✅ (`auth.uid() = requester_id`) |
| Update interest request status | ✅ | UC owner only | ❌ |
| Access `/`, `/metrics`, `/settings` | ✅ | ❌ (redirected to `/backlog`) | ❌ |

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
- ✅ **Stafftool merge** (Approach A from `docs/superpowers/specs/2026-04-24-stafftool-merge-design.md`): shared Supabase, `ia_lab_*` schema, read-only stafftool wrappers, orthogonal roles, CI grep-guard. Deployed 2026-04-29.
- ✅ **Initial deploy** to Vercel under personal scope (`enzos-projects-32aade38/ia-lab`) at `https://ia-lab-five.vercel.app`.
- ✅ **Documents bucket fix** (migration 011): private `documents` Storage bucket + RLS, signed-URL downloads, error-surfacing on uploads. Deployed 2026-04-30.
- ✅ **UC submission flow + role-based page gating** (migration 012, design `2026-04-30-submission-flow-and-role-gating-design.md`): non-admins submit lightweight proposals; admins approve/reject from the dashboard widget; admin-only pages gated server-side; concurrent-approval guard. Deployed 2026-04-30.

### Next up (see `PLAN.md`)
- [ ] Backlog **liste view** polish + Kanban/List toggle (partially done — `list-view.tsx` exists).
- [ ] UC **detail Sheet** replacing the Dialog (currently `use-case-detail-dialog.tsx`).
- [ ] **Settings refonte** — 4 tabs (Profil / Tags / Utilisateurs / Configuration).
- [ ] **Tracking** — undefined; brainstorm before coding.

### Known bug to handle
- [ ] **Métriques mission bug** — `addMission` in `src/components/backlog/use-case-gains-panel.tsx:94-106` errors silently with a toast for both IMPACT and LAB. Capture the exact error message + DevTools network response, then debug systematically.

### Operational follow-ups
- [ ] Get Digilityx GitHub admin to authorize Vercel for `Digilityx/IA-LAB`, then transfer Vercel project from personal scope to Digilityx team to unlock auto-deploy on push.
- [ ] Add `https://ia-lab-five.vercel.app/**` to Supabase auth Redirect URLs (one-time UI step).
- [ ] Next 16 deprecation: rename `src/middleware.ts` → `src/proxy.ts` (cosmetic).
- [ ] Smoke-test the submission flow on prod with a non-admin colleague (deferred from 2026-04-30).

### Known open questions
- Adding a new enum value requires a SQL migration. No runtime config path yet.
- No audit log on `ia_lab_user_roles` changes.
- Gallery has no filters/search beyond what's already coded — revisit if the number of published UCs grows.
- No notification when a submission is approved or rejected — submitter learns by checking `/backlog`. Email or in-app notifications are a future enhancement.

---

## 8. Glossary (FR)

- **UC** — Use Case.
- **Backlog** — the Kanban board itself (not just the leftmost column).
- **Sprint** — 23-day delivery window.
- **IMPACT / LAB / PRODUCT** — the three UC categories driving how a UC is tracked (client revenue / internal R&D / productized asset).
- **TJM** — Taux Journalier Moyen (daily billing rate).
