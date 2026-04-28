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
- Multi-assignee per UC within a sprint (`sprint_use_case_assignments`, migration 005).
- Burndown chart (Recharts).
- Statuses: `planned` / `active` / `completed`.
- Admin delete policy (migration 008).

### 3.4 Gallery
- Lists UCs with `is_published = true`.
- Cards show cover image, short description.
- **Interest requests** — `interested` / `want_to_use` / `propose_to_client`. Status lifecycle: `pending` → `contacted` → `resolved`. Read/archive flags (migration 009). Owner + admins can update status.

### 3.5 Metrics
- Aggregates across delivered UCs:
  - Margin generated, MRR, total man-days saved, additional business.
  - Missions (`uc_missions`): client, consultant, TJM snapshot, days saved.
  - Deals (`uc_deals`): client, amount, quote date.
- Category history (`uc_category_history`, migration 010) — audit trail when a UC's category changes.

### 3.6 Settings (refonte planifiée — 4 onglets)
1. **Profil** — name, email, department, role.
2. **Tags** — inline-editable table (name, color picker). AlertDialog on delete (removes from all UCs).
3. **Utilisateurs** — table with role/department inline-editable.
4. **Configuration** — read-only reference for PG enums (statuses, categories, priorities, colors). Adding values requires a new SQL migration.

### 3.7 Airtable import
- `scripts/import-airtable.ts` (run via `npm run import:airtable`) ingests the 5 CSVs at repo root (prioriser / cadrage / conception / livrés / abandonnés).
- Helper `scripts/fix-abandoned.ts` patches the `abandoned` enum value (added after migration 001 — see `use_case_status`).

---

## 4. Data model

### Core entities
| Table | Purpose | Key fields |
|---|---|---|
| `profiles` | Extends `auth.users` (stafftool-owned) | `role`, `team`, `tjm` |
| `sprints` | Delivery sprints | `start_date`, `end_date`, `status` |
| `use_cases` | Central entity | `status`, `category`, `priority`, `sprint_id`, `owner_id`, `is_published`, `documentation`, `cover_image_url`, `deliverable_type`, `usage_type`, `tools`, `target_users`, `benchmark_url`, `journey_url`, `next_steps`, `transfer_status` |
| `use_case_members` | Team per UC | `role` (owner / contributor / reviewer) |
| `tags` + `use_case_tags` | Free-form labels | `color` (hex) |
| `use_case_metrics` | 1:1 with UC | `margin_generated`, `mrr`, `man_days_*`, `additional_business`, `notes` — `man_days_saved` is a generated column |
| `use_case_documents` | Attachments | `file_url`, `file_size` |
| `sprint_use_cases` + `_assignments` | Sprint planning, multi-assignee | `estimated_days` per assignment |
| `uc_missions` | Revenue attribution | `consultant_id`, `mission_client`, `days_saved`, `mission_amount`, `tjm_snapshot` |
| `uc_deals` | Client deals | `client`, `amount`, `quote_date` |
| `uc_category_history` | Audit log | `old_category`, `new_category`, `changed_by`, `changed_at` |
| `interest_requests` | Gallery demand signals | `type`, `status`, `is_read`, `is_archived` |

### Enums (PostgreSQL — not editable at runtime)
- `user_role` — `admin` / `member` / `viewer`
- `sprint_status` — `planned` / `active` / `completed`
- `use_case_status` — `backlog` / `todo` / `in_progress` / `done` / `abandoned`
- `use_case_category` — `IMPACT` / `LAB` / `PRODUCT`
- `priority_level` — `low` / `medium` / `high` / `critical`
- `member_role` — `owner` / `contributor` / `reviewer`
- `interest_type` — `interested` / `want_to_use` / `propose_to_client`
- `interest_status` — `pending` / `contacted` / `resolved`

### Triggers
- `handle_new_user` — stafftool-owned trigger that auto-creates a `profiles` row on `auth.users` insert (used by both apps).
- `update_updated_at` — bumps `updated_at` on `use_cases` and `use_case_metrics`.

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
- **Security** — RLS is the source of truth. Never trust client-side role checks alone.
- **Encoding** — migration 006 (`fix_mojibake`) exists because of past UTF-8 import issues — stay UTF-8 end-to-end when importing data.

---

## 7. Roadmap

### In flight (see `PLAN.md`)
- [ ] Backlog **liste view** + Kanban/List toggle.
- [ ] UC **detail Sheet** replacing the Dialog (currently `use-case-detail-dialog.tsx`).
- [ ] **Settings refonte** — 4 tabs (Profil / Tags / Utilisateurs / Configuration).

### Known open questions
- Adding a new `use_case_status`, `use_case_category` or `priority_level` value requires a SQL migration. No runtime config path yet.
- No audit log on profile role changes.
- Gallery has no filters/search beyond what's already coded — revisit if the number of published UCs grows.

---

## 8. Glossary (FR)

- **UC** — Use Case.
- **Backlog** — the Kanban board itself (not just the leftmost column).
- **Sprint** — 23-day delivery window.
- **IMPACT / LAB / PRODUCT** — the three UC categories driving how a UC is tracked (client revenue / internal R&D / productized asset).
- **TJM** — Taux Journalier Moyen (daily billing rate).
