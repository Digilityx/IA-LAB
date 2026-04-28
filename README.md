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
