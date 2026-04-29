# UC submission flow + role-based page gating — design

**Date:** 2026-04-30
**Status:** Design approved; implementation plan to follow
**Owner:** EnzoPezlo
**Related:** [`SPECS.md`](../../../SPECS.md), [`CLAUDE.md`](../../../CLAUDE.md), [`PLAN.md`](../../../PLAN.md), [`2026-04-24-stafftool-merge-design.md`](./2026-04-24-stafftool-merge-design.md)

---

## 1. Context

Project-hub currently treats every authenticated user the same way once they hit the dashboard. The Kanban, gallery, sprints, metrics, and settings are all visible to anyone with an `ia_lab_user_roles` entry, regardless of role. The "Nouveau use case" popin lets anyone create a UC directly into the backlog, bypassing any review.

We need to differentiate **admin** from **non-admin** members:

- Admins keep access to every page and feature, including direct UC creation.
- Non-admins see only `/backlog`, `/sprints`, `/gallery`. On the backlog they cannot create UCs directly — they **submit** a lightweight proposal that an admin must review and approve before it becomes a real UC.

Submissions surface in the existing dashboard widget (currently "Dernières demandes d'intérêt", soon "Dernières demandes"), mixed with gallery interest requests. Admins triage from there.

### Goals

1. Hide admin-only pages from non-admins (`/`, `/metrics`, `/settings`) at both the navigation layer (sidebar) and the routing layer (server-side redirect).
2. Replace direct UC creation for non-admins with a simple submission flow (Titre / Description / Type d'utilisation).
3. Give non-admins in-app visibility into the status of their submissions on `/backlog` (pending, rejected with reason).
4. Give admins a unified triage feed on the dashboard (interest requests + UC submissions) with explicit approve / reject actions.
5. Reuse the existing "Nouveau use case" popin for the approval flow with prefilled fields.

### Non-goals (deferred)

- **Métriques mission bug** — adding a mission on a backlog UC's gains panel currently errors. Tracked as a separate bug, handled via systematic-debugging once the exact error is captured.
- **Tracking** — explicitly deferred per Enzo.
- **Email / push notifications** on approve / reject — not built. Submitters learn outcomes by checking `/backlog`.
- **Auto-promote submitter to UC owner** on approval. The admin sets the owner field freely in the popin, same as today.
- **Multi-step rejection workflows** (e.g. "request more info"). Status stays binary: pending → approved or pending → rejected.

---

## 2. Decision table

| Decision | Choice | Rationale |
|---|---|---|
| Submissions data model | Separate `ia_lab_use_case_submissions` table | Keeps `ia_lab_use_cases` queries clean across Kanban / metrics / gallery / sprint dashboards; preserves audit trail post-approval. |
| Submitter visibility | Dedicated "Vos demandes" section on `/backlog` (pending + recently rejected) | Non-admins need a status surface near where they submitted; avoids overloading the admin dashboard with mixed audiences. |
| Dashboard widget feed | Mixed feed — submissions + interest requests, sorted by `created_at` | Single triage inbox; type-specific icon and click action. |
| Approval popin | Reuse `CreateUseCaseDialog` with `approvalSource` prop | One component, two modes; ~50 LOC of additions vs. a duplicate dialog. |
| Reject UX | Required rejection reason via `AlertDialog` opened from the approval popin | "Why" matters more than for an interest request; saves a Slack thread per rejection. AlertDialog matches the existing "delete UC" confirm pattern. |
| Quick reject from widget | **Removed** — all rejections go through the popin so the admin sees prefilled fields first | Avoids accidental rejections; keeps the admin in context. |
| Page-level gating | Server-side guard in `(dashboard)/layout.tsx` + sidebar nav filter | Single source of truth in the layout; RLS already protects data, so this is a routing/UX layer. |
| Pathname plumbing | `x-pathname` header injected via `src/middleware.ts` | Next 16 doesn't expose `pathname` to layouts; this is the canonical workaround. |
| Submitter edits | Submitter can edit / delete own pending submission; locked after admin acts | Self-service correction without admin overhead. |
| Rejected-row retention | Visible to submitter for 30 days, then hidden by query filter (row stays in DB for audit) | Quiet UI; durable history. |

---

## 3. Data model

### 3.1 New table

```sql
CREATE TYPE ia_lab_submission_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE ia_lab_use_case_submissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  usage_type           TEXT,
  status               ia_lab_submission_status NOT NULL DEFAULT 'pending',
  rejection_reason     TEXT,
  approved_use_case_id UUID REFERENCES ia_lab_use_cases(id) ON DELETE SET NULL,
  reviewed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT submission_rejection_reason_required
    CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND rejection_reason <> '')),
  CONSTRAINT submission_approved_has_uc
    CHECK (status <> 'approved' OR approved_use_case_id IS NOT NULL),
  CONSTRAINT submission_reviewed_consistent
    CHECK (
      (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX ia_lab_use_case_submissions_status_created_idx
  ON ia_lab_use_case_submissions (status, created_at DESC);

CREATE INDEX ia_lab_use_case_submissions_submitted_by_idx
  ON ia_lab_use_case_submissions (submitted_by);

ALTER TABLE ia_lab_use_case_submissions ENABLE ROW LEVEL SECURITY;
```

### 3.2 RLS policies

| Policy | Operation | USING / WITH CHECK |
|---|---|---|
| `submissions read own + admin all` | SELECT | `submitted_by = auth.uid() OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])` |
| `submissions insert own pending` | INSERT | WITH CHECK: `submitted_by = auth.uid() AND status = 'pending'` |
| `submissions submitter edits own pending` | UPDATE | USING + WITH CHECK: `submitted_by = auth.uid() AND status = 'pending'` |
| `submissions admin updates any` | UPDATE | USING + WITH CHECK: `has_ia_lab_role(ARRAY['admin']::ia_lab_role[])` |
| `submissions submitter or admin deletes pending` | DELETE | `(submitted_by = auth.uid() AND status = 'pending') OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])` |

### 3.3 Column-level invariants (BEFORE UPDATE trigger)

RLS USING / WITH CHECK runs against full rows, so it cannot prevent a non-admin from setting `status = 'approved'` on their own pending row. A small trigger enforces it:

```sql
CREATE FUNCTION ia_lab_submissions_guard_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.approved_use_case_id IS DISTINCT FROM OLD.approved_use_case_id
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    THEN
      RAISE EXCEPTION 'Only admins can mutate review/status columns';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ia_lab_submissions_guard_columns_trg
  BEFORE UPDATE ON ia_lab_use_case_submissions
  FOR EACH ROW EXECUTE FUNCTION ia_lab_submissions_guard_columns();
```

This trigger also handles `updated_at` so we don't need the shared `ia_lab_update_updated_at()` on this table (avoids two-trigger race confusion).

### 3.4 Migration file

`supabase/migrations/012_ia_lab_use_case_submissions.sql`. Idempotent:

- `CREATE TYPE … IF NOT EXISTS` (via `DO $$ BEGIN … EXCEPTION WHEN duplicate_object … END $$`).
- `CREATE TABLE IF NOT EXISTS`.
- `DROP POLICY IF EXISTS` then `CREATE POLICY`.
- `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`.

Apply via the Supabase SQL editor (per CLAUDE.md). Migration 011 (documents bucket) was applied today; this is 012.

---

## 4. Front-end architecture

### 4.1 New / modified files

| File | Type | Purpose |
|---|---|---|
| `supabase/migrations/012_ia_lab_use_case_submissions.sql` | NEW | Table + enum + RLS + trigger |
| `src/types/database.ts` | MODIFY | Add `UseCaseSubmission`, `SubmissionStatus` types |
| `src/lib/ia-lab-routes.ts` | NEW | Single source of truth for the navigation route list (name, href, icon, `adminOnly`) — consumed by `Sidebar` and the layout guard |
| `src/components/layout/sidebar.tsx` | MODIFY | Accept `role` prop, filter `adminOnly` items |
| `src/middleware.ts` | MODIFY | Inject `x-pathname` header into the request so server layouts can read it |
| `src/app/(dashboard)/layout.tsx` | MODIFY | Server-side role check, redirect to `/backlog` for non-admins on admin-only routes |
| `src/components/backlog/submit-use-case-dialog.tsx` | NEW | Simplified 3-field form (Titre / Description / Type d'utilisation); accepts optional `submissionToEdit` prop |
| `src/components/backlog/your-submissions.tsx` | NEW | Non-admin's "Vos demandes" section above the Kanban |
| `src/app/(dashboard)/backlog/page.tsx` | MODIFY | Role-aware button (`<CreateUseCaseDialog />` vs `<SubmitUseCaseDialog />`); render `<YourSubmissions />` for non-admins |
| `src/components/backlog/create-use-case-dialog.tsx` | MODIFY | Add `approvalSource?: { submission, submitter }` prop, conditional title / submitter strip / approve+reject buttons |
| `src/app/(dashboard)/page.tsx` | MODIFY | Rename widget to "Dernières demandes"; mixed feed (interest requests + pending submissions); click submission row → open `CreateUseCaseDialog` in approval mode |

### 4.2 Role-gated routing

`src/lib/ia-lab-routes.ts`:

```ts
import { LayoutDashboard, KanbanSquare, CalendarRange, BarChart3, Store, Settings } from "lucide-react"

export const dashboardRoutes = [
  { name: "Dashboard",  href: "/",         icon: LayoutDashboard, adminOnly: true,  exact: true  },
  { name: "Backlog",    href: "/backlog",  icon: KanbanSquare,    adminOnly: false, exact: false },
  { name: "Sprints",    href: "/sprints",  icon: CalendarRange,   adminOnly: false, exact: false },
  { name: "Métriques",  href: "/metrics",  icon: BarChart3,       adminOnly: true,  exact: false },
  { name: "Galerie",    href: "/gallery",  icon: Store,           adminOnly: false, exact: false },
  { name: "Paramètres", href: "/settings", icon: Settings,        adminOnly: true,  exact: false },
] as const

export function isAdminOnlyPath(pathname: string): boolean {
  return dashboardRoutes.some(r =>
    r.adminOnly && (r.exact ? pathname === r.href : pathname.startsWith(r.href))
  )
}
```

`src/middleware.ts` — set `x-pathname` so the layout can read it:

```ts
import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  response.headers.set("x-pathname", request.nextUrl.pathname)
  return response
}
```

`src/app/(dashboard)/layout.tsx` — server component, checks role + path:

```tsx
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getCurrentIaLabRole } from "@/lib/ia-lab-roles"
import { isAdminOnlyPath } from "@/lib/ia-lab-routes"
import { Sidebar } from "@/components/layout/sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getCurrentIaLabRole()
  const pathname = (await headers()).get("x-pathname") ?? "/"

  if (isAdminOnlyPath(pathname) && role !== "admin") {
    redirect("/backlog")
  }

  return (
    <div className="flex h-screen">
      <Sidebar role={role} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

### 4.3 Submission flow (non-admin)

`SubmitUseCaseDialog`:

- Trigger: `<Button><Plus />Soumettre un use case</Button>`.
- Form fields (Zod-validated):
  - `title: string` — required, min 3 chars.
  - `description: string` — optional.
  - `usage_type: 'Interne Digi' | 'Productivite missions' | 'Vente' | null` — `<Select>` matching the existing options.
- On submit:
  - INSERT (or UPDATE if `submissionToEdit` is passed) into `ia_lab_use_case_submissions`.
  - Toast success: `"Demande envoyée — en attente de validation"` (or `"Demande mise à jour"` for edits).
  - Optimistic refresh of `<YourSubmissions />` via the parent's `onSubmitted()` callback.

`YourSubmissions`:

- Fetches `ia_lab_use_case_submissions WHERE submitted_by = auth.uid() AND (status = 'pending' OR (status = 'rejected' AND reviewed_at >= now() - interval '30 days'))`.
- Renders two stacked groups: `En attente` and `Refusées` (each hidden if empty).
- Each pending row: title • "En attente" badge • [Modifier] [Supprimer] buttons.
- Each rejected row: title • "Refusée" badge • inline rejection reason in muted text. No actions.
- Empty state: section is hidden entirely (no "Aucune demande" placeholder — the section is conditional).

### 4.4 Approval flow (admin)

`CreateUseCaseDialog` with `approvalSource` prop:

```tsx
type ApprovalSource = {
  submission: UseCaseSubmission
  submitter: StafftoolProfile
}

interface CreateUseCaseDialogProps {
  onCreated: () => void
  approvalSource?: ApprovalSource
  open?: boolean
  onOpenChange?: (open: boolean) => void
}
```

When `approvalSource` is set:

- Dialog title: "Approuver une demande".
- Header strip below the title: small avatar + `"Demande de {full_name} le {formatDate(created_at)}"`.
- `title`, `description`, `usage_type` initial state seeded from `approvalSource.submission`.
- Bottom buttons: `[Annuler] [Rejeter] [Approuver]` (replacing `[Annuler] [Créer]`).
- **Approuver** action:
  1. INSERT into `ia_lab_use_cases` (existing flow).
  2. UPDATE the submission: `status='approved'`, `approved_use_case_id=<new.id>`, `reviewed_by=auth.uid()`, `reviewed_at=now()`.
  3. Toast: `"Demande approuvée — use case créé"`. Close dialog. Refresh dashboard widget.
- **Rejeter** action:
  1. An `AlertDialog` opens with a `<Textarea>` requesting the rejection reason. Required (button disabled while empty).
  2. UPDATE the submission: `status='rejected'`, `rejection_reason=<reason>`, `reviewed_by=auth.uid()`, `reviewed_at=now()`.
  3. Toast: `"Demande rejetée"`. Close dialog. Refresh dashboard widget.

### 4.5 Dashboard widget — mixed feed

Rename only at `(dashboard)/page.tsx:267`. Empty-state copy: `"Aucune demande récente"`.

Data fetch — two queries, merged client-side:

```ts
const [interests, submissions] = await Promise.all([
  supabase.from("ia_lab_interest_requests")
    .select("*, requester:profiles!ia_lab_interest_requests_requester_id_fkey(*), use_case:ia_lab_use_cases(title)")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(10),
  supabase.from("ia_lab_use_case_submissions")
    .select("*, submitter:profiles!ia_lab_use_case_submissions_submitted_by_fkey(*)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10),
])

type FeedItem =
  | { kind: 'interest';   item: InterestRequest;   created_at: string }
  | { kind: 'submission'; item: UseCaseSubmission; created_at: string }

const feed: FeedItem[] = [
  ...(interests.data ?? []).map(i => ({ kind: 'interest' as const, item: i, created_at: i.created_at })),
  ...(submissions.data ?? []).map(s => ({ kind: 'submission' as const, item: s, created_at: s.created_at })),
]
.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
.slice(0, 10)
```

Render conditionally:

- **Interest row** — current visual (Heart / Sparkles / Briefcase icon, name + label + UC title, mark-read / archive / delete actions).
- **Submission row** — `<Inbox />` icon, `"{submitter.full_name} a soumis {title}"`, click anywhere on the row → opens `CreateUseCaseDialog` in approval mode. No hover quick-reject.

The widget tracks an `approvingSubmission` state to control the dialog's `open` and `approvalSource`. On dialog close (any path: cancel, approve, reject), refetch the feed.

---

## 5. Error handling

- **Submission insert fails (RLS denial, FK violation):** toast `"Erreur lors de la soumission"`. No silent failure (lesson from the documents-bucket bug — every Supabase write is checked).
- **Approval insert fails:** the submission is *not* marked approved (the UPDATE only runs after the INSERT succeeds). User sees toast and can retry.
- **Rejection without reason:** UI prevents submit (button disabled when `rejectionReason.trim() === ""`); CHECK constraint is the DB-side guard.
- **Concurrent approval (two admins click the same submission):** the second admin's UPDATE will run on a row already marked `approved`. The trigger doesn't block this (admin can mutate any row), so the second click would update `reviewed_by`/`reviewed_at`/`rejection_reason` to whatever was last clicked. Acceptable for an internal tool with ~5 admins; a proper fix (UPDATE … WHERE status = 'pending' RETURNING …) is a future-hardening item if needed.
- **Layout role-check throws:** wrap in try/catch, fall back to `redirect("/login")`. Better to over-redirect than to leak a page.

---

## 6. Testing

No automated tests in the repo today (per CLAUDE.md). Verification is manual smoke-testing through the standard flows:

1. **Non-admin user** can see only `/backlog`, `/sprints`, `/gallery` in the sidebar.
2. Visiting `/`, `/metrics`, or `/settings` as a non-admin redirects to `/backlog`.
3. Non-admin clicks "Soumettre un use case" → fills the simple form → submits → row appears in "Vos demandes / En attente".
4. Non-admin can edit a pending submission, can delete a pending submission.
5. Admin sees the submission in the dashboard "Dernières demandes" widget alongside any interest requests.
6. Admin clicks the submission → popin opens with prefilled fields and the submitter strip.
7. Admin approves → UC appears in the Kanban; submission row leaves the widget; submission row leaves the submitter's "Vos demandes / En attente".
8. Admin rejects (with reason) → submission leaves the widget; appears in submitter's "Vos demandes / Refusées" with the reason inline.
9. Submission older than 30 days that was rejected no longer appears in "Vos demandes / Refusées" (DB row remains).

---

## 7. Migration / rollout

Single shared production environment. Order:

1. Apply `012_ia_lab_use_case_submissions.sql` via Supabase SQL editor.
2. Verify by inserting a manual row as the bootstrap admin and checking RLS denies a non-admin's bypass attempts (e.g. `INSERT … (status, submitted_by) VALUES ('approved', '<other-uid>')` should fail).
3. Deploy code changes via `vercel --prod` (manual, per current deploy state).
4. Smoke-test the flows above with two test accounts (one admin, one non-admin).

No data migration needed (new table, empty on creation).

No rollback path needed beyond `DROP TABLE ia_lab_use_case_submissions; DROP TYPE ia_lab_submission_status;` and `git revert` if the deployment misbehaves — submission data is brand new and non-critical.

---

## 8. Open follow-ups (not in this design)

- Métriques mission bug — separate systematic-debug task once the exact error is captured.
- Tracking — deferred per Enzo.
- Optional future hardening: optimistic-concurrency `WHERE status = 'pending'` guard on approve/reject UPDATEs, if dual-admin races become a real problem.
- Optional future feature: notify the submitter (email or in-app) when their submission is approved or rejected. Not in scope for this iteration.
