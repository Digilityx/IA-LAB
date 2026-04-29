# UC submission flow + role-based page gating — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Differentiate IA Lab admins from members — admins see every page and can create UCs directly; members see only `/backlog`, `/sprints`, `/gallery` and submit UC proposals that admins approve or reject.

**Architecture:** New `ia_lab_use_case_submissions` table with column-level RLS via trigger. Server-side role check in `(dashboard)/layout.tsx` redirects non-admins from admin-only routes; sidebar filters admin-only items via a shared route table. Non-admins use a simplified `SubmitUseCaseDialog` (3 fields) and see their own pending/rejected submissions in a `YourSubmissions` section on `/backlog`. Admins approve/reject from a mixed-feed dashboard widget that opens the existing `CreateUseCaseDialog` reused in "approval" mode with prefilled fields.

**Tech Stack:** Next.js 16 App Router (Server Components for layout, Client Components for interactive UI), React 19, Supabase (`@supabase/ssr` 0.8 server + `@supabase/supabase-js` 2.97 client), shadcn (`Dialog`, `AlertDialog`, `Select`, `Textarea`, `Badge`, `Avatar`, `Button`), `lucide-react` icons, `sonner` toasts. No automated test suite — verification is `npx tsc --noEmit`, `npm run lint`, and manual smoke-tests through `npm run dev`.

**Reference spec:** [`docs/superpowers/specs/2026-04-30-submission-flow-and-role-gating-design.md`](../specs/2026-04-30-submission-flow-and-role-gating-design.md)

---

## File structure

| File | New / Modify | Responsibility |
|---|---|---|
| `supabase/migrations/012_ia_lab_use_case_submissions.sql` | New | Table + enum + indexes + RLS + trigger |
| `src/types/database.ts` | Modify | Add `SubmissionStatus`, `UseCaseSubmission` types |
| `src/lib/ia-lab-routes.ts` | New | Shared dashboard route table (`adminOnly` flag) and `isAdminOnlyPath()` helper |
| `src/lib/ia-lab-roles-server.ts` | New | Server-side `getCurrentIaLabRoleServer()` (uses `@/lib/supabase/server`) |
| `src/hooks/use-ia-lab-role.ts` | New | Client-side hook for components that need role for conditional UI |
| `src/middleware.ts` | Modify | Inject `x-pathname` header on every request so server layout can read `pathname` |
| `src/app/(dashboard)/layout.tsx` | Modify | Async server component; server-side role + path check; redirect to `/backlog` for non-admins on admin-only routes |
| `src/components/layout/sidebar.tsx` | Modify | Accept `role` prop; render only routes the user can see |
| `src/components/backlog/submit-use-case-dialog.tsx` | New | Simplified 3-field submission form (Titre / Description / Type d'utilisation); supports edit mode via `submissionToEdit` prop |
| `src/components/backlog/your-submissions.tsx` | New | Non-admin's "Vos demandes" section (pending + recently-rejected) |
| `src/app/(dashboard)/backlog/page.tsx` | Modify | Render `<SubmitUseCaseDialog />` + `<YourSubmissions />` for non-admins; keep `<CreateUseCaseDialog />` for admins |
| `src/components/backlog/create-use-case-dialog.tsx` | Modify | Add `approvalSource` + controlled `open`/`onOpenChange` props; conditional title/strip/buttons; approve+reject handlers |
| `src/app/(dashboard)/page.tsx` | Modify | Rename widget to "Dernières demandes"; merged feed (interest requests + pending submissions); click submission → open `CreateUseCaseDialog` in approval mode |

---

## Task 1 — Migration: `ia_lab_use_case_submissions` table

**Files:**
- Create: `supabase/migrations/012_ia_lab_use_case_submissions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =========================================================================
-- 012_ia_lab_use_case_submissions.sql
--
-- Lightweight UC proposals submitted by IA Lab members. Admins approve →
-- a real ia_lab_use_cases row is created; reject → reason recorded.
-- Idempotent — safe to re-run.
-- =========================================================================

-- Enum
DO $$
BEGIN
  CREATE TYPE ia_lab_submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Table
CREATE TABLE IF NOT EXISTS ia_lab_use_case_submissions (
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

CREATE INDEX IF NOT EXISTS ia_lab_use_case_submissions_status_created_idx
  ON ia_lab_use_case_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ia_lab_use_case_submissions_submitted_by_idx
  ON ia_lab_use_case_submissions (submitted_by);

ALTER TABLE ia_lab_use_case_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "submissions read own + admin all"            ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions insert own pending"              ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions submitter edits own pending"     ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions admin updates any"               ON ia_lab_use_case_submissions;
DROP POLICY IF EXISTS "submissions submitter or admin deletes pending" ON ia_lab_use_case_submissions;

CREATE POLICY "submissions read own + admin all" ON ia_lab_use_case_submissions
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])
  );

CREATE POLICY "submissions insert own pending" ON ia_lab_use_case_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "submissions submitter edits own pending" ON ia_lab_use_case_submissions
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid() AND status = 'pending'
  )
  WITH CHECK (
    submitted_by = auth.uid() AND status = 'pending'
  );

CREATE POLICY "submissions admin updates any" ON ia_lab_use_case_submissions
  FOR UPDATE TO authenticated
  USING ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) )
  WITH CHECK ( has_ia_lab_role(ARRAY['admin']::ia_lab_role[]) );

CREATE POLICY "submissions submitter or admin deletes pending" ON ia_lab_use_case_submissions
  FOR DELETE TO authenticated
  USING (
    (submitted_by = auth.uid() AND status = 'pending')
    OR has_ia_lab_role(ARRAY['admin']::ia_lab_role[])
  );

-- Column-level guard trigger: non-admins cannot mutate review/status columns
CREATE OR REPLACE FUNCTION ia_lab_submissions_guard_columns()
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

DROP TRIGGER IF EXISTS ia_lab_submissions_guard_columns_trg ON ia_lab_use_case_submissions;
CREATE TRIGGER ia_lab_submissions_guard_columns_trg
  BEFORE UPDATE ON ia_lab_use_case_submissions
  FOR EACH ROW EXECUTE FUNCTION ia_lab_submissions_guard_columns();
```

- [ ] **Step 2: Apply the migration via Supabase SQL editor**

Open https://supabase.com/dashboard/project/fflrtslsujuweggxylbd/sql/new, paste the file content, run.

Expected output: `Success. No rows returned.`

- [ ] **Step 3: Verify the table and policies exist**

Run in the Supabase SQL editor:

```sql
-- Verify table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ia_lab_use_case_submissions'
ORDER BY ordinal_position;

-- Verify policies
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'ia_lab_use_case_submissions'
ORDER BY policyname;

-- Verify trigger
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'ia_lab_use_case_submissions';
```

Expected: 12 columns, 5 policies, 1 trigger (`ia_lab_submissions_guard_columns_trg` BEFORE UPDATE).

- [ ] **Step 4: Smoke-test RLS — submitter inserts own pending succeed; admin status mutation succeeds; non-admin status mutation fails**

Still in the SQL editor (acts as the bootstrap admin `c857b15d-943e-4876-ac20-2eb1988e8ec8`):

```sql
-- Insert as the bootstrap admin acting as themselves
INSERT INTO ia_lab_use_case_submissions (submitted_by, title, description)
VALUES ('c857b15d-943e-4876-ac20-2eb1988e8ec8', '[DEV] migration test', 'should succeed')
RETURNING id, status;
```

Expected: 1 row returned with `status = 'pending'`.

```sql
-- Cleanup
DELETE FROM ia_lab_use_case_submissions
WHERE title = '[DEV] migration test';
```

- [ ] **Step 5: No commit yet — code changes follow**

The SQL file is checked into git as part of the repo migration history. We commit it at the end of the next task.

---

## Task 2 — Add types + shared route table + role helpers

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/ia-lab-routes.ts`
- Create: `src/lib/ia-lab-roles-server.ts`
- Create: `src/hooks/use-ia-lab-role.ts`

- [ ] **Step 1: Append types to `src/types/database.ts`**

Insert after the `InterestRequest` interface (the last interface in the file):

```ts
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface UseCaseSubmission {
  id: string
  submitted_by: string
  title: string
  description: string | null
  usage_type: string | null
  status: SubmissionStatus
  rejection_reason: string | null
  approved_use_case_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  // Joined
  submitter?: Profile
  reviewer?: Profile
}
```

- [ ] **Step 2: Create the shared route table**

Write `src/lib/ia-lab-routes.ts`:

```ts
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarRange,
  BarChart3,
  Store,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface DashboardRoute {
  name: string
  href: string
  icon: LucideIcon
  adminOnly: boolean
  /** When true, only the exact pathname matches; otherwise startsWith. */
  exact: boolean
}

export const dashboardRoutes: readonly DashboardRoute[] = [
  { name: 'Dashboard',  href: '/',         icon: LayoutDashboard, adminOnly: true,  exact: true  },
  { name: 'Backlog',    href: '/backlog',  icon: KanbanSquare,    adminOnly: false, exact: false },
  { name: 'Sprints',    href: '/sprints',  icon: CalendarRange,   adminOnly: false, exact: false },
  { name: 'Métriques',  href: '/metrics',  icon: BarChart3,       adminOnly: true,  exact: false },
  { name: 'Galerie',    href: '/gallery',  icon: Store,           adminOnly: false, exact: false },
  { name: 'Paramètres', href: '/settings', icon: Settings,        adminOnly: true,  exact: false },
] as const

export function isAdminOnlyPath(pathname: string): boolean {
  return dashboardRoutes.some(
    (r) =>
      r.adminOnly && (r.exact ? pathname === r.href : pathname.startsWith(r.href))
  )
}
```

- [ ] **Step 3: Create the server-side role helper**

Write `src/lib/ia-lab-roles-server.ts`:

```ts
// Server-side IA Lab role lookup. Mirrors src/lib/ia-lab-roles.ts but uses
// the server Supabase client so it can run in Server Components, Route
// Handlers, and middleware-adjacent code.
import { createClient } from '@/lib/supabase/server'
import type { IaLabRole } from '@/lib/ia-lab-roles'

export async function getCurrentIaLabRoleServer(): Promise<IaLabRole | null> {
  const supabase = await createClient()
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
```

- [ ] **Step 4: Create the client-side role hook**

Write `src/hooks/use-ia-lab-role.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { getCurrentIaLabRole, type IaLabRole } from '@/lib/ia-lab-roles'

interface UseIaLabRoleResult {
  role: IaLabRole | null
  loading: boolean
}

/**
 * Client-side hook for components that need the current user's IA Lab role
 * to conditionally render UI. The DB enforces authorization via RLS — this
 * is purely for UX (hide buttons, swap labels).
 */
export function useIaLabRole(): UseIaLabRoleResult {
  const [role, setRole] = useState<IaLabRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getCurrentIaLabRole()
      .then((r) => {
        if (!cancelled) setRole(r)
      })
      .catch((e) => {
        console.error('Failed to fetch IA Lab role', e)
        if (!cancelled) setRole(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { role, loading }
}
```

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit migration + foundational code**

```bash
git add supabase/migrations/012_ia_lab_use_case_submissions.sql \
        src/types/database.ts \
        src/lib/ia-lab-routes.ts \
        src/lib/ia-lab-roles-server.ts \
        src/hooks/use-ia-lab-role.ts
git commit -m "feat(submissions): migration 012 + types + role helpers + route table

Adds ia_lab_use_case_submissions table with column-level RLS via
trigger. Foundation pieces: shared dashboard route table with
adminOnly flag, server-side role helper for layout guard, and a
client-side role hook for conditional UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Middleware injects `x-pathname`; sidebar becomes role-aware; layout enforces gating

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update middleware to set `x-pathname` on every request**

Replace `src/middleware.ts` with:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  // Layouts can't read pathname directly in Next 16 — surface it via header.
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Update sidebar to consume `role` prop and shared route table**

Replace `src/components/layout/sidebar.tsx` with:

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { dashboardRoutes } from '@/lib/ia-lab-routes'
import type { IaLabRole } from '@/lib/ia-lab-roles'

interface SidebarProps {
  role: IaLabRole | null
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleRoutes = dashboardRoutes.filter(
    (r) => !r.adminOnly || role === 'admin'
  )

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          IA
        </div>
        <span className="text-lg font-semibold">IA Lab</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleRoutes.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Convert dashboard layout to async server component with role+path guard**

Replace `src/app/(dashboard)/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { createClient } from '@/lib/supabase/server'
import { getCurrentIaLabRoleServer } from '@/lib/ia-lab-roles-server'
import { isAdminOnlyPath } from '@/lib/ia-lab-routes'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let role
  try {
    role = await getCurrentIaLabRoleServer()
  } catch (e) {
    console.error('Failed to read IA Lab role in layout', e)
    redirect('/login')
  }

  const pathname = (await headers()).get('x-pathname') ?? '/'

  if (isAdminOnlyPath(pathname) && role !== 'admin') {
    redirect('/backlog')
  }

  return (
    <div className="flex h-screen">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: no new errors. (Pre-existing lint errors in `list-view.tsx`, `use-case-card.tsx`, `burndown-chart.tsx` are out of scope.)

- [ ] **Step 5: Manual smoke-test in dev**

Run: `npm run dev`

Open http://localhost:3000 as the bootstrap admin. Expect: full sidebar (Dashboard / Backlog / Sprints / Métriques / Galerie / Paramètres) visible; all routes accessible.

To test the non-admin path, either temporarily delete your `ia_lab_user_roles` row (and re-create after) or sign in as a member. Expect: only Backlog / Sprints / Galerie in sidebar; visiting `/`, `/metrics`, `/settings` redirects to `/backlog`.

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/components/layout/sidebar.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat(auth): role-gated dashboard layout + sidebar

Layout server-side checks IA Lab role and redirects non-admins from
admin-only routes (/, /metrics, /settings) to /backlog. Sidebar
filters items via shared route table. Middleware injects x-pathname
header so the layout can read the current path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — `SubmitUseCaseDialog` component

**Files:**
- Create: `src/components/backlog/submit-use-case-dialog.tsx`

- [ ] **Step 1: Write the component**

Write `src/components/backlog/submit-use-case-dialog.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { UseCaseSubmission } from '@/types/database'

interface SubmitUseCaseDialogProps {
  /** When provided, the dialog opens prefilled and updates the existing submission instead of inserting. */
  submissionToEdit?: UseCaseSubmission | null
  /** Controlled open state — required when used in edit mode (no internal trigger). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmitted: () => void
}

const USAGE_TYPE_OPTIONS = [
  'Interne Digi',
  'Productivite missions',
  'Vente',
] as const

export function SubmitUseCaseDialog({
  submissionToEdit,
  open: controlledOpen,
  onOpenChange,
  onSubmitted,
}: SubmitUseCaseDialogProps) {
  const isEditMode = !!submissionToEdit
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [usageType, setUsageType] = useState<string>('')

  // Prefill on open / when submissionToEdit changes
  useEffect(() => {
    if (open) {
      setTitle(submissionToEdit?.title ?? '')
      setDescription(submissionToEdit?.description ?? '')
      setUsageType(submissionToEdit?.usage_type ?? '')
    }
  }, [open, submissionToEdit])

  const reset = () => {
    setTitle('')
    setDescription('')
    setUsageType('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (title.trim().length < 3) {
      toast.error('Le titre doit faire au moins 3 caractères')
      return
    }
    setLoading(true)

    const supabase = createClient()
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      usage_type: usageType || null,
    }

    if (isEditMode && submissionToEdit) {
      const { error } = await supabase
        .from('ia_lab_use_case_submissions')
        .update(payload)
        .eq('id', submissionToEdit.id)
      if (error) {
        toast.error('Erreur lors de la mise à jour')
        console.error(error)
        setLoading(false)
        return
      }
      toast.success('Demande mise à jour')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Utilisateur non connecté')
        setLoading(false)
        return
      }
      const { error } = await supabase
        .from('ia_lab_use_case_submissions')
        .insert({ ...payload, submitted_by: user.id })
      if (error) {
        toast.error('Erreur lors de la soumission')
        console.error(error)
        setLoading(false)
        return
      }
      toast.success('Demande envoyée — en attente de validation')
    }

    setLoading(false)
    setOpen(false)
    reset()
    onSubmitted()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEditMode && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Soumettre un use case
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Modifier la demande' : 'Soumettre un use case'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="submit-title">Titre</Label>
            <Input
              id="submit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nom du use case"
              required
              minLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="submit-description">Description</Label>
            <Textarea
              id="submit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du use case..."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Type d&apos;utilisation</Label>
            <Select value={usageType} onValueChange={setUsageType}>
              <SelectTrigger>
                <SelectValue placeholder="Optionnel" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? (isEditMode ? 'Mise à jour...' : 'Envoi...')
                : (isEditMode ? 'Mettre à jour' : 'Soumettre')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: No commit yet — wired up in next task**

---

## Task 5 — `YourSubmissions` component

**Files:**
- Create: `src/components/backlog/your-submissions.tsx`

- [ ] **Step 1: Write the component**

Write `src/components/backlog/your-submissions.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SubmitUseCaseDialog } from '@/components/backlog/submit-use-case-dialog'
import type { UseCaseSubmission } from '@/types/database'

const REJECTION_VISIBLE_DAYS = 30

export function YourSubmissions() {
  const [submissions, setSubmissions] = useState<UseCaseSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UseCaseSubmission | null>(null)
  const [deleting, setDeleting] = useState<UseCaseSubmission | null>(null)

  const fetchSubmissions = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const cutoff = new Date(
      Date.now() - REJECTION_VISIBLE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data, error } = await supabase
      .from('ia_lab_use_case_submissions')
      .select('*')
      .eq('submitted_by', user.id)
      .or(`status.eq.pending,and(status.eq.rejected,reviewed_at.gte.${cutoff})`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load submissions', error)
      toast.error('Erreur lors du chargement de vos demandes')
    } else {
      setSubmissions((data ?? []) as UseCaseSubmission[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  const handleDelete = async () => {
    if (!deleting) return
    const supabase = createClient()
    const { error } = await supabase
      .from('ia_lab_use_case_submissions')
      .delete()
      .eq('id', deleting.id)
    if (error) {
      toast.error('Erreur lors de la suppression')
      console.error(error)
    } else {
      toast.success('Demande supprimée')
      setSubmissions((prev) => prev.filter((s) => s.id !== deleting.id))
    }
    setDeleting(null)
  }

  if (loading || submissions.length === 0) return null

  const pending = submissions.filter((s) => s.status === 'pending')
  const rejected = submissions.filter((s) => s.status === 'rejected')

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Vos demandes</h2>
        <p className="text-xs text-muted-foreground">
          Demandes en attente de validation et refus récents
        </p>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            En attente ({pending.length})
          </p>
          {pending.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{s.title}</span>
                <Badge variant="secondary" className="shrink-0">En attente</Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditing(s)}
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(s)}
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Refusées ({rejected.length})
          </p>
          {rejected.map((s) => (
            <div
              key={s.id}
              className="rounded-md border bg-card px-3 py-2 space-y-1"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{s.title}</span>
                <Badge variant="destructive" className="shrink-0">Refusée</Badge>
              </div>
              {s.rejection_reason && (
                <p className="text-xs text-muted-foreground">
                  Raison : {s.rejection_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <SubmitUseCaseDialog
        submissionToEdit={editing}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null) }}
        onSubmitted={fetchSubmissions}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette demande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La demande sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: No commit yet — wired up in next task**

---

## Task 6 — Wire backlog page for non-admins

**Files:**
- Modify: `src/app/(dashboard)/backlog/page.tsx`

- [ ] **Step 1: Add role-aware button + YourSubmissions section**

Modify `src/app/(dashboard)/backlog/page.tsx`. Add imports near the existing imports:

```tsx
import { SubmitUseCaseDialog } from "@/components/backlog/submit-use-case-dialog"
import { YourSubmissions } from "@/components/backlog/your-submissions"
import { useIaLabRole } from "@/hooks/use-ia-lab-role"
```

Inside the component, add near other hooks:

```tsx
const { role, loading: roleLoading } = useIaLabRole()
const isAdmin = role === 'admin'
```

Replace the line `<CreateUseCaseDialog onCreated={fetchData} />` with:

```tsx
{isAdmin ? (
  <CreateUseCaseDialog onCreated={fetchData} />
) : (
  <SubmitUseCaseDialog onSubmitted={fetchData} />
)}
```

Replace the existing `if (loading) { ... }` block with the combined check that also waits for role:

```tsx
if (loading || roleLoading) {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Chargement...</p>
    </div>
  )
}
```

Just before the existing filter row (the `<div className="flex items-center gap-3">`), insert the YourSubmissions section for non-admins:

```tsx
{!isAdmin && <YourSubmissions />}
```

Resulting structure (header → YourSubmissions → filter row → kanban/list):

```tsx
return (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Backlog</h1>
        <p className="text-sm text-muted-foreground">
          Gérez vos use cases par sprint
        </p>
      </div>
      {isAdmin ? (
        <CreateUseCaseDialog onCreated={fetchData} />
      ) : (
        <SubmitUseCaseDialog onSubmitted={fetchData} />
      )}
    </div>

    {!isAdmin && <YourSubmissions />}

    <div className="flex items-center gap-3">
      {/* ...existing filters... */}
    </div>

    {/* ...existing kanban/list... */}
  </div>
)
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: no new errors.

- [ ] **Step 3: Commit submission flow (non-admin side)**

```bash
git add src/components/backlog/submit-use-case-dialog.tsx \
        src/components/backlog/your-submissions.tsx \
        src/app/\(dashboard\)/backlog/page.tsx
git commit -m "feat(submissions): non-admin submit flow on /backlog

Adds SubmitUseCaseDialog (3-field simplified form) and YourSubmissions
section showing pending + recently-rejected submissions for the current
user. The backlog page renders the simplified flow for non-admins;
admins keep the full CreateUseCaseDialog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Modify `CreateUseCaseDialog` for approval mode

**Files:**
- Modify: `src/components/backlog/create-use-case-dialog.tsx`

- [ ] **Step 1: Replace the file**

Replace `src/components/backlog/create-use-case-dialog.tsx` entirely with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type {
  UseCaseCategory,
  PriorityLevel,
  Sprint,
  UseCaseSubmission,
  Profile,
} from '@/types/database'
import { searchProfiles } from '@/lib/stafftool/profiles'
import type { StafftoolProfile } from '@/lib/stafftool/types'

export interface ApprovalSource {
  submission: UseCaseSubmission
  /** Minimum needed: id + full_name for the strip. Profile is structurally a subset of StafftoolProfile. */
  submitter: Pick<Profile, 'id' | 'full_name'>
}

interface CreateUseCaseDialogProps {
  onCreated: () => void
  approvalSource?: ApprovalSource | null
  /** Controlled open state (required when used in approval mode). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CreateUseCaseDialog({
  onCreated,
  approvalSource,
  open: controlledOpen,
  onOpenChange,
}: CreateUseCaseDialogProps) {
  const isApprovalMode = !!approvalSource
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [loading, setLoading] = useState(false)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [members, setMembers] = useState<StafftoolProfile[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<UseCaseCategory>('LAB')
  const [priority, setPriority] = useState<PriorityLevel>('medium')
  const [sprintId, setSprintId] = useState<string>('')
  const [ownerId, setOwnerId] = useState<string>('')
  const [deliverableType, setDeliverableType] = useState('')
  const [usageType, setUsageType] = useState('')
  const [tools, setTools] = useState('')

  // Reject flow
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const reset = () => {
    setTitle('')
    setDescription('')
    setCategory('LAB')
    setPriority('medium')
    setSprintId('')
    setDeliverableType('')
    setUsageType('')
    setTools('')
    setRejectReason('')
  }

  useEffect(() => {
    if (!open) return
    const fetchData = async () => {
      const supabase = createClient()
      const [sprintsRes, membersData, userRes] = await Promise.all([
        supabase.from('ia_lab_sprints').select('*').order('start_date', { ascending: false }),
        searchProfiles(''),
        supabase.auth.getUser(),
      ])
      if (sprintsRes.data) setSprints(sprintsRes.data)
      setMembers(membersData)
      if (userRes.data.user && !ownerId) setOwnerId(userRes.data.user.id)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Prefill from approvalSource on open
  useEffect(() => {
    if (open && approvalSource) {
      setTitle(approvalSource.submission.title)
      setDescription(approvalSource.submission.description ?? '')
      setUsageType(approvalSource.submission.usage_type ?? '')
    }
  }, [open, approvalSource])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    const supabase = createClient()

    let finalOwnerId = ownerId
    if (!finalOwnerId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        finalOwnerId = user.id
        setOwnerId(user.id)
      }
    }

    if (!finalOwnerId) {
      toast.error('Impossible de déterminer le responsable')
      setLoading(false)
      return
    }

    const insertData: Record<string, unknown> = {
      title,
      description,
      category,
      priority,
      sprint_id: sprintId && sprintId !== 'none' ? sprintId : null,
      owner_id: finalOwnerId,
      status: 'backlog',
    }
    if (deliverableType && deliverableType !== 'none') insertData.deliverable_type = deliverableType
    if (usageType && usageType !== 'none') insertData.usage_type = usageType
    if (tools) insertData.tools = tools

    const { data: insertedUc, error } = await supabase
      .from('ia_lab_use_cases')
      .insert(insertData)
      .select('id')
      .single()

    if (error || !insertedUc) {
      toast.error(
        isApprovalMode
          ? "Erreur lors de l'approbation"
          : 'Erreur lors de la création du use case'
      )
      console.error('Erreur création use case:', error?.message)
      setLoading(false)
      return
    }

    if (sprintId && sprintId !== 'none') {
      await supabase.from('ia_lab_sprint_use_cases').insert({
        sprint_id: sprintId,
        use_case_id: insertedUc.id,
      })
    }

    if (isApprovalMode && approvalSource) {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: updErr } = await supabase
        .from('ia_lab_use_case_submissions')
        .update({
          status: 'approved',
          approved_use_case_id: insertedUc.id,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approvalSource.submission.id)
      if (updErr) {
        toast.error("UC créé, mais erreur lors de la mise à jour de la demande")
        console.error(updErr)
      } else {
        toast.success('Demande approuvée — use case créé')
      }
    } else {
      toast.success('Use case créé avec succès')
    }

    setOpen(false)
    reset()
    onCreated()
    setLoading(false)
  }

  const handleReject = async () => {
    if (!approvalSource) return
    if (rejectReason.trim().length === 0) return
    setRejecting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('ia_lab_use_case_submissions')
      .update({
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', approvalSource.submission.id)

    if (error) {
      toast.error('Erreur lors du rejet')
      console.error(error)
      setRejecting(false)
      return
    }

    toast.success('Demande rejetée')
    setRejectOpen(false)
    setRejectReason('')
    setRejecting(false)
    setOpen(false)
    reset()
    onCreated()
  }

  const dialogTitle = isApprovalMode ? 'Approuver une demande' : 'Créer un use case'

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        {!isApprovalMode && (
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau use case
            </Button>
          </DialogTrigger>
        )}
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {isApprovalMode && approvalSource && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {approvalSource.submitter.full_name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span>
                Demande de <strong>{approvalSource.submitter.full_name}</strong>
                {' '}le {new Date(approvalSource.submission.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nom du use case"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description du use case..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as UseCaseCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMPACT">IMPACT</SelectItem>
                    <SelectItem value="LAB">LAB</SelectItem>
                    <SelectItem value="PRODUCT">PRODUCT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as PriorityLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="critical">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type de livrable</Label>
                <Select value={deliverableType} onValueChange={setDeliverableType}>
                  <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non defini</SelectItem>
                    <SelectItem value="Build">Build</SelectItem>
                    <SelectItem value="Bonnes pratiques">Bonnes pratiques</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type d&apos;utilisation</Label>
                <Select value={usageType} onValueChange={setUsageType}>
                  <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non defini</SelectItem>
                    <SelectItem value="Interne Digi">Interne Digi</SelectItem>
                    <SelectItem value="Productivite missions">Productivite missions</SelectItem>
                    <SelectItem value="Vente">Vente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Outils pressentis</Label>
              <Input
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                placeholder="Ex: ChatGPT, Cursor, Make... (optionnel)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sprint</Label>
                <Select value={sprintId} onValueChange={setSprintId}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {sprints.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsable</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              {isApprovalMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={loading}
                >
                  Rejeter
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading
                  ? (isApprovalMode ? 'Approbation...' : 'Création...')
                  : (isApprovalMode ? 'Approuver' : 'Créer')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter cette demande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Indiquez la raison du rejet — le demandeur pourra la lire dans son backlog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet..."
            rows={4}
          />
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setRejectOpen(false); setRejectReason('') }}
              disabled={rejecting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || rejectReason.trim().length === 0}
            >
              {rejecting ? 'Rejet...' : 'Confirmer le rejet'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

Note: this file imports `AlertDialogFooter` from the existing alert-dialog component (used elsewhere in the repo).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: no new errors.

- [ ] **Step 3: No commit yet — wired up by next task**

---

## Task 8 — Dashboard widget: rename + mixed feed

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Add submission feed merging + approval popin wiring**

Replace `src/app/(dashboard)/page.tsx` entirely with:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  KanbanSquare,
  CalendarRange,
  BarChart3,
  Store,
  Heart,
  Sparkles,
  Briefcase,
  ArrowRight,
  Mail,
  MailOpen,
  Archive,
  Trash2,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CreateUseCaseDialog,
  type ApprovalSource,
} from '@/components/backlog/create-use-case-dialog'
import { searchProfiles } from '@/lib/stafftool/profiles'
import type {
  Sprint,
  UseCase,
  InterestRequest,
  UseCaseSubmission,
} from '@/types/database'

const interestIcons: Record<string, React.ElementType> = {
  interested: Heart,
  want_to_use: Sparkles,
  propose_to_client: Briefcase,
}

const interestLabels: Record<string, string> = {
  interested: 'Intéressé',
  want_to_use: 'Souhaite utiliser',
  propose_to_client: 'Proposer à un client',
}

type FeedItem =
  | { kind: 'interest';   item: InterestRequest;   created_at: string }
  | { kind: 'submission'; item: UseCaseSubmission; created_at: string }

export default function DashboardPage() {
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [stats, setStats] = useState({ total: 0, inProgress: 0, done: 0, published: 0 })
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [sprintUseCases, setSprintUseCases] = useState<UseCase[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalSource, setApprovalSource] = useState<ApprovalSource | null>(null)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [sprintRes, ucRes, interestsRes, submissionsRes] = await Promise.all([
      supabase
        .from('ia_lab_sprints')
        .select('*')
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('ia_lab_use_cases').select('id, status, is_published'),
      supabase
        .from('ia_lab_interest_requests')
        .select(
          '*, requester:profiles!ia_lab_interest_requests_requester_id_fkey(*), use_case:ia_lab_use_cases(title)'
        )
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('ia_lab_use_case_submissions')
        .select(
          '*, submitter:profiles!ia_lab_use_case_submissions_submitted_by_fkey(*)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    if (sprintRes.data) {
      setActiveSprint(sprintRes.data)
      const { data: sprintUc } = await supabase
        .from('ia_lab_use_cases')
        .select('*, owner:profiles!ia_lab_use_cases_owner_id_fkey(*)')
        .eq('sprint_id', sprintRes.data.id)
        .order('created_at')
      if (sprintUc) setSprintUseCases(sprintUc as UseCase[])
    }

    if (ucRes.data) {
      setStats({
        total: ucRes.data.length,
        inProgress: ucRes.data.filter((uc) => uc.status === 'in_progress').length,
        done: ucRes.data.filter((uc) => uc.status === 'done').length,
        published: ucRes.data.filter((uc) => uc.is_published).length,
      })
    }

    const interestItems: FeedItem[] = (interestsRes.data ?? []).map((i) => ({
      kind: 'interest' as const,
      item: i as InterestRequest,
      created_at: i.created_at,
    }))
    const submissionItems: FeedItem[] = (submissionsRes.data ?? []).map((s) => ({
      kind: 'submission' as const,
      item: s as UseCaseSubmission,
      created_at: s.created_at,
    }))
    setFeed(
      [...interestItems, ...submissionItems]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 10)
    )

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('ia_lab_interest_requests')
      .update({ is_read: !currentRead })
      .eq('id', id)
    if (error) toast.error('Erreur')
    else {
      setFeed((prev) =>
        prev.map((f) =>
          f.kind === 'interest' && f.item.id === id
            ? { ...f, item: { ...f.item, is_read: !currentRead } }
            : f
        )
      )
    }
  }

  const handleArchive = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('ia_lab_interest_requests')
      .update({ is_archived: true })
      .eq('id', id)
    if (error) toast.error('Erreur')
    else {
      setFeed((prev) =>
        prev.filter((f) => !(f.kind === 'interest' && f.item.id === id))
      )
      toast.success('Notification archivée')
    }
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('ia_lab_interest_requests')
      .delete()
      .eq('id', id)
    if (error) toast.error('Erreur lors de la suppression')
    else {
      setFeed((prev) =>
        prev.filter((f) => !(f.kind === 'interest' && f.item.id === id))
      )
      toast.success('Notification supprimée')
    }
  }

  const handleOpenSubmission = async (s: UseCaseSubmission) => {
    // The submission feed query already joins the submitter profile.
    // Fall back to a profile search if the join was empty for some reason.
    let submitter: { id: string; full_name: string } | undefined = s.submitter
      ? { id: s.submitter.id, full_name: s.submitter.full_name }
      : undefined
    if (!submitter) {
      const profiles = await searchProfiles('')
      const found = profiles.find((p) => p.id === s.submitted_by)
      if (found) submitter = { id: found.id, full_name: found.full_name }
    }
    if (!submitter) {
      toast.error('Profil du demandeur introuvable')
      return
    }
    setApprovalSource({ submission: s, submitter })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    backlog: 'Backlog',
    todo: 'À faire',
    in_progress: 'En cours',
    done: 'Terminé',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble de vos projets
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/backlog">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <KanbanSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total use cases</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En cours</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Terminés</p>
              <p className="text-2xl font-bold">{stats.done}</p>
            </div>
          </CardContent>
        </Card>
        <Link href="/gallery">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Publiés</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Sprint */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {activeSprint ? `Sprint actif : ${activeSprint.name}` : 'Aucun sprint actif'}
            </CardTitle>
            {activeSprint && (
              <Link
                href={`/sprints/${activeSprint.id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Voir <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {sprintUseCases.length > 0 ? (
              <div className="space-y-2">
                {sprintUseCases.slice(0, 6).map((uc) => (
                  <Link
                    key={uc.id}
                    href={`/backlog/${uc.id}`}
                    className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-accent transition-colors"
                  >
                    <span className="text-sm truncate">{uc.title}</span>
                    <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                      {statusLabels[uc.status]}
                    </Badge>
                  </Link>
                ))}
                {sprintUseCases.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    +{sprintUseCases.length - 6} autres
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                {activeSprint
                  ? 'Aucun use case dans ce sprint'
                  : 'Créez un sprint et passez-le en actif'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Mixed feed: interest requests + UC submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Dernières demandes</CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length > 0 ? (
              <div className="space-y-1">
                {feed.map((f) => {
                  if (f.kind === 'interest') {
                    const req = f.item
                    const Icon = interestIcons[req.type] || Heart
                    return (
                      <div
                        key={`i-${req.id}`}
                        className={`group flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                          req.is_read ? 'opacity-60' : 'bg-accent/40'
                        }`}
                      >
                        <div className="relative mt-0.5">
                          {!req.is_read && (
                            <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary" />
                          )}
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px]">
                              {req.requester?.full_name
                                ?.split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">{req.requester?.full_name}</span>
                            <span className="text-muted-foreground">
                              {' '}— {interestLabels[req.type]}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {(req.use_case as unknown as { title: string })?.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleToggleRead(req.id, req.is_read)}
                            title={req.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                          >
                            {req.is_read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleArchive(req.id)}
                            title="Archiver"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(req.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    )
                  } else {
                    const sub = f.item
                    return (
                      <button
                        key={`s-${sub.id}`}
                        type="button"
                        onClick={() => handleOpenSubmission(sub)}
                        className="w-full text-left flex items-start gap-3 rounded-lg p-2.5 transition-colors bg-accent/40 hover:bg-accent"
                      >
                        <div className="mt-0.5">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px]">
                              {sub.submitter?.full_name
                                ?.split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">{sub.submitter?.full_name}</span>
                            <span className="text-muted-foreground"> a soumis</span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {sub.title}
                          </p>
                        </div>
                        <Inbox className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </button>
                    )
                  }
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucune demande récente
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approval popin (controlled by approvalSource state) */}
      <CreateUseCaseDialog
        onCreated={() => {
          setApprovalSource(null)
          fetchData()
        }}
        approvalSource={approvalSource}
        open={!!approvalSource}
        onOpenChange={(o) => { if (!o) setApprovalSource(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: no new errors.

- [ ] **Step 3: Commit approval flow**

```bash
git add src/components/backlog/create-use-case-dialog.tsx \
        src/app/\(dashboard\)/page.tsx
git commit -m "feat(submissions): admin approval flow + mixed feed widget

CreateUseCaseDialog gains an approvalSource prop that prefills the form
from a pending submission, swaps Créer for Approuver/Rejeter, and shows
a submitter strip. Approve INSERTs the UC and updates the submission
to approved; Reject opens an AlertDialog requiring a reason.

Dashboard widget renamed to 'Dernières demandes' and merges interest
requests with pending submissions sorted by created_at. Click any
submission row to open the approval popin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — End-to-end smoke test + deploy

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: server up at http://localhost:3000.

- [ ] **Step 2: Smoke-test as admin**

Sign in as the bootstrap admin (`enzo.lopez@digilityx.com`).

- Sidebar shows all 6 entries.
- `/`, `/metrics`, `/settings` all render normally.
- On `/backlog`, the button reads "Nouveau use case".
- The dashboard widget is titled "Dernières demandes".

- [ ] **Step 3: Smoke-test as a non-admin**

Easiest path: open a private window and sign in as another Digilityx user with a `member` row in `ia_lab_user_roles`. If no such user exists yet, create a member row in the SQL editor:

```sql
INSERT INTO ia_lab_user_roles (user_id, role)
VALUES ('<some-other-auth-uid>', 'member')
ON CONFLICT (user_id) DO UPDATE SET role = 'member';
```

As that user:

- Sidebar shows only Backlog / Sprints / Galerie.
- Visiting `/`, `/metrics`, `/settings` redirects to `/backlog`.
- On `/backlog`, the button reads "Soumettre un use case" with a `+` icon.
- Clicking it opens a 3-field popin (Titre / Description / Type d'utilisation).
- Submit a `[DEV] test submission` — toast: "Demande envoyée — en attente de validation".
- The "Vos demandes" section appears above the filter row, showing the submission as "En attente".
- Click the pencil icon — the same popin reopens prefilled. Edit the title, save — toast: "Demande mise à jour".

- [ ] **Step 4: Smoke-test admin approval / rejection**

Switch back to the admin window:

- Reload `/`. The submission appears in "Dernières demandes" with the submitter's avatar and "a soumis".
- Click the row → CreateUseCaseDialog opens titled "Approuver une demande" with the submitter strip + prefilled fields.
- Click **Approuver** → toast: "Demande approuvée — use case créé". Dialog closes. Widget refetches and the submission row is gone. Visit `/backlog` → the new UC is in the Kanban backlog column.
- In the non-admin window, reload `/backlog` — "Vos demandes" no longer shows the (now approved) submission.

- Submit another `[DEV] test 2` from the non-admin window.
- Reload admin `/` → it appears.
- Click → click **Rejeter** → AlertDialog opens. Try empty reason: button stays disabled. Type a reason → click **Confirmer le rejet**. Toast: "Demande rejetée".
- Non-admin reloads `/backlog` → "Vos demandes / Refusées" shows the entry with the reason inline.

- [ ] **Step 5: Cleanup test data**

In the SQL editor:

```sql
-- Remove test rows; cascade handles ia_lab_use_case_members + tags
DELETE FROM ia_lab_use_cases WHERE title LIKE '[DEV]%';
DELETE FROM ia_lab_use_case_submissions WHERE title LIKE '[DEV]%';
```

If you created a temporary `member` row for a colleague, decide whether to keep it or remove it via `DELETE FROM ia_lab_user_roles WHERE user_id = '<uid>'`.

- [ ] **Step 6: Stop dev server**

Stop the foreground `npm run dev` (Ctrl-C). If running in background, kill the process bound to port 3000.

- [ ] **Step 7: Deploy**

```bash
vercel --prod
```

- [ ] **Step 8: Production smoke-test**

Open https://ia-lab-five.vercel.app and repeat steps 2–4 quickly. Tear down any `[DEV]` rows again.

---

## Out of scope (explicit reminders)

- **Métriques mission bug** — `addMission` in `use-case-gains-panel.tsx:94-106` errors silently for both IMPACT and LAB. Handled separately via systematic-debugging once the exact error is captured (toast text + DevTools network response). Not part of this plan.
- **Tracking** — deferred per Enzo.
- **Email / push notifications** on approve/reject — not in this plan.
- **Documents-bucket changes** (migration 011 + dialog upload fix from earlier in the session) — already applied to prod and uncommitted in the working tree. They can be committed alongside this work or separately; either way they ride to prod the next time `vercel --prod` runs.
