// scripts/import-airtable.ts
// Imports the 5 Airtable CSV exports at repo root into ia_lab_use_cases on the shared Supabase.
// Maps owner names to stafftool profiles.id via fuzzy match; unmatched → owner_id NULL.
// Always runs --dry-run first against prod to preview the insert plan.
//
// Usage:
//   npx tsx scripts/import-airtable.ts --dry-run
//   npx tsx scripts/import-airtable.ts --confirm
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'

// Config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const CONFIRM = args.has('--confirm')
if (!DRY_RUN && !CONFIRM) {
  console.error('Must pass --dry-run OR --confirm. Refusing to run against prod without explicit intent.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

type UcStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'abandoned'
type UcCategory = 'IMPACT' | 'LAB' | 'PRODUCT'
type UcPriority = 'low' | 'medium' | 'high' | 'critical'

// --- CSV inputs: each CSV → target status on the imported UC ---
// Status is inferred from the filename (matches real Airtable export names at repo root).
const CSV_TARGETS: Array<{ file: string; status: UcStatus }> = [
  { file: 'BDD UCs livrés Airtable - 1 - A prioriser.csv', status: 'backlog' },
  { file: 'BDD UCs livrés Airtable - 2 - En cadrage.csv', status: 'todo' },
  { file: 'BDD UCs livrés Airtable - 3 - Conception (1).csv', status: 'in_progress' },
  { file: 'BDD UCs livrés Airtable - 4 - UCs Livrés.csv', status: 'done' },
  { file: 'BDD UCs livrés Airtable - 5 - Abandonnés.csv', status: 'abandoned' },
]

type Row = Record<string, string>

/**
 * Minimal CSV parser for the Airtable exports at repo root.
 * Assumes UTF-8, comma-separated. Handles quoted fields (including quoted fields
 * that contain commas, as seen in "Equipe projet" with multiple names).
 */
async function readCsv(file: string): Promise<Row[]> {
  const raw = await fs.readFile(path.resolve(file), 'utf-8')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []

  function parseCsvLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])) as Row
  })
}

const profileCache = new Map<string, string | null>()
async function resolveOwnerId(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const key = trimmed.toLowerCase()
  if (profileCache.has(key)) return profileCache.get(key) ?? null
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .ilike('full_name', `%${trimmed}%`)
    .limit(1)
  const id = (data && data[0]?.id) ?? null
  profileCache.set(key, id)
  return id
}

function normalizeCategory(raw: string): UcCategory {
  const v = raw.trim().toUpperCase()
  if (v === 'IMPACT' || v === 'LAB' || v === 'PRODUCT') return v
  return 'LAB' // sensible default
}

function normalizePriority(raw: string): UcPriority {
  const v = raw.trim().toLowerCase()
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v
  return 'medium'
}

interface Plan {
  title: string
  description: string
  status: UcStatus
  category: UcCategory
  priority: UcPriority
  owner_id: string | null
  owner_name_raw: string
  owner_resolved: boolean
}

// Real CSV column headers from the Airtable exports:
//   "Use cases"             → title
//   "Description/objectifs?" → description
//   "Equipe projet"         → team / owner (first name in comma-separated list)
//   "Themes"                → themes (not stored in ia_lab_use_cases, logged only)
//   "Statut"                → ignored; status is overridden from filename
//   "Type de livrable", "Type d'utilisation", "Outil pressentis",
//   "Utilisateur de la solution?", "Lien du benchmark solutions existantes",
//   "Lien parcours"         → not in ia_lab_use_cases schema, skipped
async function buildPlan(): Promise<Plan[]> {
  const plans: Plan[] = []
  for (const { file, status } of CSV_TARGETS) {
    let rows: Row[] = []
    try {
      rows = await readCsv(file)
    } catch (err) {
      console.warn(`Skipping ${file}: ${(err as Error).message}`)
      continue
    }
    console.log(`${file}: ${rows.length} rows`)
    for (const row of rows) {
      // "Equipe projet" may contain multiple names separated by commas (e.g. "Enzo Lopez, Yanis Sif").
      // We take the first name as the primary owner.
      const rawTeam = row['Equipe projet'] || ''
      const firstName = rawTeam.split(',')[0].trim()
      const ownerId = await resolveOwnerId(firstName)
      plans.push({
        // Real column name in the Airtable CSVs is "Use cases" (not "Title")
        title: row['Use cases'] || '(sans titre)',
        // Real column name is "Description/objectifs? " (with trailing space in some exports)
        description: row['Description/objectifs? '] || row['Description/objectifs?'] || row['Description'] || '',
        status,
        category: normalizeCategory(row['Category'] || row['Catégorie'] || ''),
        priority: normalizePriority(row['Priority'] || row['Priorité'] || ''),
        owner_id: ownerId,
        owner_name_raw: firstName,
        owner_resolved: ownerId !== null,
      })
    }
  }
  return plans
}

async function main() {
  const plans = await buildPlan()
  const unresolved = plans.filter((p) => !p.owner_resolved && p.owner_name_raw.trim())

  console.log('\n=== Import plan ===')
  console.log(`Total rows: ${plans.length}`)
  console.log(`With resolved owner: ${plans.length - unresolved.length}`)
  console.log(`With unresolved owner (→ owner_id NULL): ${unresolved.length}`)
  if (unresolved.length > 0) {
    console.log('\nUnresolved owner names:')
    const uniq = new Set(unresolved.map((p) => p.owner_name_raw))
    for (const n of uniq) console.log(`  - ${n}`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No rows written. Re-run with --confirm to apply.')
    return
  }

  console.log('\n[CONFIRM] Writing to ia_lab_use_cases...')
  for (const p of plans) {
    const { error } = await supabase.from('ia_lab_use_cases').upsert(
      {
        title: p.title,
        description: p.description,
        status: p.status,
        category: p.category,
        priority: p.priority,
        owner_id: p.owner_id,
      },
      { onConflict: 'title,category', ignoreDuplicates: true },
    )
    if (error) {
      console.error('UPSERT failed:', p.title, '→', error.message)
    }
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
