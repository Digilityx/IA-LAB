// scripts/transform-dump.ts
// One-shot transformation: takes the previous dev's ialab_dump.sql (old schema,
// dev-local profile UUIDs) and produces an .sql file ready to paste into
// Supabase SQL editor against stafftool prod (new ia_lab_* schema, mapped UUIDs).
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/transform-dump.ts <dump-path> <out-path>
//
// What it does:
// - Drops INSERT INTO public.profiles (managed by stafftool, not us)
// - Drops INSERT INTO public.use_case_accompaniment (table doesn't exist in our schema)
// - Renames every other table to ia_lab_*
// - Maps dev's local profile UUIDs to stafftool's prod profile UUIDs by full_name lookup
// - For required profile FKs (use_case_members, sprint_use_case_assignments):
//     skips rows whose profile_id can't be mapped
// - For optional profile FKs (use_cases.owner_id, sprints.created_by, sprint_use_cases.assigned_to):
//     substitutes unmapped UUIDs with NULL
// - Adds ON CONFLICT DO NOTHING to every INSERT for idempotent re-runs
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const dumpPath = process.argv[2] || '.dump_temp.sql'
const outPath = process.argv[3] || '.transformed_dump.sql'

const TABLE_RENAME: Record<string, string> = {
  'public.use_cases': 'public.ia_lab_use_cases',
  'public.use_case_members': 'public.ia_lab_use_case_members',
  'public.use_case_tags': 'public.ia_lab_use_case_tags',
  'public.use_case_metrics': 'public.ia_lab_use_case_metrics',
  'public.sprints': 'public.ia_lab_sprints',
  'public.sprint_use_cases': 'public.ia_lab_sprint_use_cases',
  'public.sprint_use_case_assignments': 'public.ia_lab_sprint_use_case_assignments',
  'public.tags': 'public.ia_lab_tags',
  'public.interest_requests': 'public.ia_lab_interest_requests',
}

const SKIP_TABLES = new Set([
  'public.profiles',
  'public.use_case_accompaniment',
])

// Tables where every profile_id reference must be non-null — skip the row otherwise.
const REQUIRED_PROFILE_FK_TABLES = new Set([
  'public.use_case_members',
  'public.sprint_use_case_assignments',
])

// Generated columns in our ia_lab_* schema — strip from incoming INSERTs since
// Postgres rejects writes to generated columns.
const GENERATED_COLUMNS_BY_TABLE: Record<string, string[]> = {
  'public.ia_lab_use_case_metrics': ['man_days_saved'],
}

function parseValuesList(s: string): string[] {
  // Splits a Postgres VALUES inner list on top-level commas, respecting single-quoted
  // strings (with '' as escape).
  const out: string[] = []
  let buf = ''
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      if (inQuote && s[i + 1] === "'") {
        buf += "''"
        i++
        continue
      }
      inQuote = !inQuote
      buf += c
    } else if (c === ',' && !inQuote) {
      out.push(buf.trim())
      buf = ''
    } else {
      buf += c
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function stripGeneratedColumns(stmt: string, table: string): string {
  const cols = GENERATED_COLUMNS_BY_TABLE[table]
  if (!cols) return stmt

  // Match: INSERT INTO <table> (cols...) VALUES (vals...) [trailer]
  // The values section may contain newlines and `;` only outside, so we capture greedily up to the last
  // `)` followed by ON CONFLICT or `;`.
  const re = /^(INSERT INTO \S+\s*\()([^)]+)\)\s+VALUES\s*\(([\s\S]+)\)\s*((?:ON CONFLICT|;)[\s\S]*)$/
  const m = stmt.match(re)
  if (!m) return stmt
  const [, prefix, colsStr, valsStr, trailer] = m
  const colList = colsStr.split(',').map((c) => c.trim())
  const valList = parseValuesList(valsStr)
  if (colList.length !== valList.length) return stmt // arity mismatch — bail safely

  for (const col of cols) {
    const idx = colList.indexOf(col)
    if (idx >= 0) {
      colList.splice(idx, 1)
      valList.splice(idx, 1)
    }
  }
  return `${prefix}${colList.join(', ')}) VALUES (${valList.join(', ')}) ${trailer.startsWith(';') ? '' : ''}${trailer}`
}

interface DevProfile {
  id: string
  full_name: string
  email: string
  is_placeholder: boolean
}

const UUID_RE = /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi

function parseProfileLine(line: string): DevProfile | null {
  // INSERT INTO public.profiles (id, full_name, email, role, avatar_url, department, created_at, is_placeholder, tjm) VALUES (...)
  const m = line.match(
    /VALUES\s*\(\s*'([^']+)',\s*'([^']*?)',\s*'([^']*?)',\s*'[^']*',\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*'[^']*',\s*(TRUE|FALSE)/i,
  )
  if (!m) return null
  return { id: m[1], full_name: m[2], email: m[3], is_placeholder: m[4].toUpperCase() === 'TRUE' }
}

function findInsertTable(line: string): string | null {
  const m = line.match(/^INSERT INTO (public\.[a-z_]+) /)
  return m ? m[1] : null
}

async function lookupStafftoolProfile(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  // Try exact ilike first
  let { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .ilike('full_name', trimmed)
    .limit(1)
  if (data && data[0]) return data[0].id

  // Try fuzzy: substring match
  ;({ data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .ilike('full_name', `%${trimmed}%`)
    .limit(1))
  if (data && data[0]) return data[0].id

  // Try without accents (basic ASCII fold)
  const ascii = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (ascii !== trimmed) {
    const { data: d2 } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `%${ascii}%`)
      .limit(1)
    if (d2 && d2[0]) return d2[0].id
  }

  return null
}

async function buildUuidMap(devProfiles: DevProfile[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  for (const p of devProfiles) {
    const stafftoolId = await lookupStafftoolProfile(p.full_name)
    map.set(p.id, stafftoolId)
    const status = stafftoolId ? `→ ${stafftoolId}` : 'UNMAPPED (will be NULL)'
    console.log(`  ${p.full_name.padEnd(25)} ${p.is_placeholder ? '[ph]' : '[real]'} ${status}`)
  }
  return map
}

function transformStatement(
  stmt: string,
  uuidMap: Map<string, string | null>,
): { keep: boolean; stmt: string } {
  const trimmed = stmt.trim()
  if (!trimmed) return { keep: false, stmt: '' }

  // We only forward INSERT statements. Everything else (CREATE TABLE, SET, comments, etc.) is dropped.
  if (!trimmed.startsWith('INSERT INTO')) return { keep: false, stmt: '' }

  const table = findInsertTable(trimmed)
  if (!table) return { keep: false, stmt: '' }

  if (SKIP_TABLES.has(table)) return { keep: false, stmt: '' }

  const newTable = TABLE_RENAME[table]
  if (!newTable) {
    console.warn(`  WARNING: unknown table ${table} — skipping`)
    return { keep: false, stmt: '' }
  }

  let processed = stmt.replace(`INSERT INTO ${table}`, `INSERT INTO ${newTable}`)

  // Substitute UUIDs that we have in our profile map
  let hasNullSub = false
  processed = processed.replace(UUID_RE, (_full, uuid) => {
    if (!uuidMap.has(uuid)) return `'${uuid}'`
    const newUuid = uuidMap.get(uuid)
    if (newUuid === null || newUuid === undefined) {
      hasNullSub = true
      return 'NULL'
    }
    return `'${newUuid}'`
  })

  // For tables where profile FK is required, skip rows whose profile mapping is null
  if (REQUIRED_PROFILE_FK_TABLES.has(table) && hasNullSub) {
    return { keep: false, stmt: '' }
  }

  // Add ON CONFLICT DO NOTHING for idempotency
  processed = processed.replace(/;\s*$/, '\nON CONFLICT DO NOTHING;')

  // Strip generated columns (e.g. ia_lab_use_case_metrics.man_days_saved)
  processed = stripGeneratedColumns(processed, newTable)

  return { keep: true, stmt: processed }
}

function splitStatements(sql: string): string[] {
  // Split the dump into individual SQL statements. Statement terminator is `;` at end of line.
  // This must NOT be a naive line-by-line split because some INSERT VALUES contain text fields
  // with embedded newlines.
  const out: string[] = []
  let buf = ''
  for (const line of sql.split('\n')) {
    buf += (buf ? '\n' : '') + line
    if (/;\s*$/.test(line)) {
      out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

async function main() {
  const dump = await fs.readFile(dumpPath, 'utf-8')
  const statements = splitStatements(dump)

  console.log(`Reading dump: ${dumpPath} (${statements.length} statements)\n`)

  // Step 1: extract dev profiles (one INSERT per statement)
  const devProfiles: DevProfile[] = []
  for (const stmt of statements) {
    if (stmt.startsWith('INSERT INTO public.profiles')) {
      const p = parseProfileLine(stmt)
      if (p) devProfiles.push(p)
    }
  }
  console.log(`Found ${devProfiles.length} profiles in dump.\n`)

  // Step 2: build UUID map by looking up each profile in stafftool
  console.log('Mapping dev profile UUIDs to stafftool prod profiles:')
  const uuidMap = await buildUuidMap(devProfiles)

  const mapped = [...uuidMap.values()].filter((v) => v !== null).length
  const unmapped = devProfiles.length - mapped
  console.log(`\nMapped: ${mapped}, Unmapped: ${unmapped}\n`)

  // Step 3: transform each line, bucket by target table for FK-safe ordering
  // Insert order honors FK dependencies:
  //   tags, sprints  →  use_cases  →  use_case_members, use_case_tags, use_case_metrics, sprint_use_cases  →  sprint_use_case_assignments, interest_requests
  const buckets: Record<string, string[]> = {
    'public.ia_lab_tags': [],
    'public.ia_lab_sprints': [],
    'public.ia_lab_use_cases': [],
    'public.ia_lab_use_case_members': [],
    'public.ia_lab_use_case_tags': [],
    'public.ia_lab_use_case_metrics': [],
    'public.ia_lab_sprint_use_cases': [],
    'public.ia_lab_sprint_use_case_assignments': [],
    'public.ia_lab_interest_requests': [],
  }
  const orderedTables = Object.keys(buckets)

  let kept = 0
  let dropped = 0
  for (const stmt of statements) {
    const r = transformStatement(stmt, uuidMap)
    if (!r.keep) {
      if (stmt.trim().startsWith('INSERT INTO')) dropped++
      continue
    }
    const m = r.stmt.match(/^INSERT INTO (public\.[a-z_]+) /)
    if (!m) continue
    const targetTable = m[1]
    if (buckets[targetTable]) {
      buckets[targetTable].push(r.stmt)
      kept++
    } else {
      console.warn(`  WARNING: post-transform statement targets unknown bucket ${targetTable} — dropped`)
    }
  }

  const out: string[] = []
  out.push('-- Transformed from ialab_dump.sql for stafftool prod (ia_lab_* schema)')
  out.push(`-- Generated: ${new Date().toISOString()}`)
  out.push('-- Run via Supabase SQL editor (postgres role bypasses RLS).')
  out.push('-- Idempotent: re-runnable thanks to ON CONFLICT DO NOTHING.')
  out.push('')
  out.push('BEGIN;')
  out.push('')

  for (const t of orderedTables) {
    if (buckets[t].length === 0) continue
    out.push(`-- ${t} (${buckets[t].length} rows)`)
    out.push(...buckets[t])
    out.push('')
  }

  out.push('COMMIT;')
  out.push('')

  await fs.writeFile(outPath, out.join('\n'))

  console.log(`Wrote ${outPath}`)
  console.log(`INSERTs kept (renamed + UUID-mapped): ${kept}`)
  console.log(`INSERTs dropped (skipped tables OR required-FK row with no mapping): ${dropped}`)
  for (const t of orderedTables) {
    if (buckets[t].length > 0) console.log(`  ${t}: ${buckets[t].length}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
