/**
 * Script d'import des données Airtable (CSV ou Excel) vers Supabase
 *
 * Usage:
 *   1. Appliquer la migration 002_extend_schema.sql dans le Supabase Dashboard
 *   2. Ajouter SUPABASE_SERVICE_ROLE_KEY dans .env.local
 *   3. npm run import:airtable
 *
 * Le script cherche automatiquement les fichiers CSV ou Excel à la racine du projet.
 */

import * as XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import * as path from "path"
import * as fs from "fs"
import { randomUUID } from "crypto"

// ---------- Configuration ----------

// Status mapping (Airtable status -> DB enum)
const STATUS_MAP: Record<string, string> = {
  "Livré": "done",
  "Livre": "done",
  "En cadrage": "todo",
  "Conception": "in_progress",
  "Abandonné": "abandoned",
  "Abandonne": "abandoned",
  "Priorisation": "backlog",
  "A prioriser": "backlog",
}

// Sheet name mapping (for Excel multi-sheet format)
const SHEET_STATUS_MAP: Record<string, string> = {
  "1 - A prioriser": "backlog",
  "2 - En cadrage": "todo",
  "3 - Conception": "in_progress",
  "4 - UCs Livres": "done",
  "4 - UCs Livrés": "done",
  "5 - Abandonnes": "abandoned",
  "5 - Abandonnés": "abandoned",
}

// Flexible column name matching (handles typos, accents, trailing spaces, question marks)
function findColumn(row: Record<string, unknown>, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row)
  for (const candidate of candidates) {
    // Exact match
    if (keys.includes(candidate)) return candidate
    // Fuzzy match (trim, lowercase, remove special chars)
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[?\s]+$/g, "").replace(/[éèê]/g, "e").replace(/[àâ]/g, "a")
    const candidateNorm = normalize(candidate)
    for (const key of keys) {
      if (normalize(key) === candidateNorm) return key
      // Also try startsWith for partial matches
      if (normalize(key).startsWith(candidateNorm) || candidateNorm.startsWith(normalize(key))) return key
    }
  }
  return undefined
}

// Tag colors (cycle)
const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
  "#0ea5e9", "#84cc16",
]

// ---------- Setup Supabase ----------

function getSupabase() {
  // Load .env.local manually
  const envPath = path.resolve(process.cwd(), ".env.local")
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8")
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error("❌ Erreur: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local")
    console.error("")
    console.error("Pour trouver votre SUPABASE_SERVICE_ROLE_KEY:")
    console.error("  1. Allez sur https://supabase.com/dashboard")
    console.error("  2. Sélectionnez votre projet")
    console.error("  3. Settings > API > Service Role Key (secret)")
    console.error("  4. Ajoutez dans .env.local: SUPABASE_SERVICE_ROLE_KEY=eyJ...")
    process.exit(1)
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

// ---------- Helpers ----------

function cleanStr(val: unknown): string {
  if (val == null) return ""
  return String(val).trim()
}

function splitComma(val: unknown): string[] {
  const s = cleanStr(val)
  if (!s) return []
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// Filename patterns -> DB status (for multi-CSV import)
const FILENAME_STATUS_MAP: Record<string, string> = {
  "prioriser": "backlog",
  "cadrage": "todo",
  "conception": "in_progress",
  "livr": "done",  // matches "Livrés", "Livres"
  "abandonn": "abandoned", // matches "Abandonnés", "Abandonnes"
}

// ---------- File discovery ----------

interface ImportFile {
  path: string
  type: "csv" | "excel"
  filenameStatus?: string  // status inferred from filename
}

function findImportFiles(): ImportFile[] {
  const root = process.cwd()
  const files = fs.readdirSync(root)
  const results: ImportFile[] = []

  // Look for all Airtable CSV files
  const csvFiles = files.filter(
    (f) => f.endsWith(".csv") && (f.toLowerCase().includes("airtable") || f.toLowerCase().includes("uc"))
  )

  if (csvFiles.length > 0) {
    for (const csvFile of csvFiles) {
      // Extract the last segment after " - " to match status from filename
      // e.g. "BDD UCs livrés Airtable - 5 - Abandonnés.csv" -> "abandonnés.csv"
      const segments = csvFile.split(" - ")
      const lastSegment = (segments[segments.length - 1] || csvFile).toLowerCase()
      let filenameStatus: string | undefined
      for (const [pattern, status] of Object.entries(FILENAME_STATUS_MAP)) {
        if (lastSegment.includes(pattern)) {
          filenameStatus = status
          break
        }
      }
      results.push({
        path: path.resolve(root, csvFile),
        type: "csv",
        filenameStatus,
      })
    }
    return results
  }

  // Then look for Excel files
  const xlsxFile = files.find(
    (f) => (f.endsWith(".xlsx") || f.endsWith(".xls")) && f.toLowerCase().includes("airtable")
  )
  if (xlsxFile) {
    return [{ path: path.resolve(root, xlsxFile), type: "excel" }]
  }

  console.error("❌ Aucun fichier CSV ou Excel trouvé à la racine du projet.")
  console.error("   Placez votre fichier Airtable (.csv ou .xlsx) dans:")
  console.error(`   ${root}`)
  process.exit(1)
}

// ---------- Parse data ----------

interface ParsedRow {
  title: string
  description: string
  status: string
  themes: string[]
  deliverableType: string | null
  usageType: string | null
  tools: string | null
  targetUsers: string | null
  benchmarkUrl: string | null
  journeyUrl: string | null
  teamMembers: string[]
}

function parseSingleCSV(filePath: string, overrideStatus?: string): ParsedRow[] {
  // Read CSV as UTF-8 string to handle accented characters correctly
  const csvContent = fs.readFileSync(filePath, "utf-8")
  const workbook = XLSX.read(csvContent, { type: "string" })
  const results: ParsedRow[] = []
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  if (rows.length === 0) return results

  // Detect columns from first row
  const firstRow = rows[0]
  const COL_TITLE = findColumn(firstRow, "Use cases", "Use case", "Titre", "Title")
  const COL_THEMES = findColumn(firstRow, "Themes", "Thèmes", "Theme")
  const COL_DELIVERABLE = findColumn(firstRow, "Type de livrable", "Deliverable type")
  const COL_USAGE = findColumn(firstRow, "Type d'utilisation", "Usage type")
  const COL_TOOLS = findColumn(firstRow, "Outil pressentis", "Outils pressentis", "Tools")
  const COL_STATUS = findColumn(firstRow, "Statut", "Status")
  const COL_TEAM = findColumn(firstRow, "Equipe projet", "Équipe projet", "Team")
  const COL_DESC = findColumn(firstRow, "Description/objectifs", "Description", "Objectifs")
  const COL_USERS = findColumn(firstRow, "Utilisateur de la solution", "Target users")
  const COL_BENCH = findColumn(firstRow, "Lien du benchmark solutions existantes", "Benchmark", "Lien benchmark")
  const COL_JOURNEY = findColumn(firstRow, "Lien parcours", "Journey", "Parcours")

  if (!COL_TITLE) {
    console.warn(`  ⚠️  Colonne titre non trouvée — fichier ignoré`)
    return results
  }

  for (const row of rows) {
    const title = cleanStr(row[COL_TITLE!])
    if (!title) continue

    // Determine status: filename override > column value > default
    let status = overrideStatus || "done"
    if (!overrideStatus && COL_STATUS) {
      const rawStatus = cleanStr(row[COL_STATUS])
      const mapped = STATUS_MAP[rawStatus]
      if (mapped) status = mapped
    }

    // Fix for Airtable CSV export bug: in some sheets (e.g. "En cadrage"),
    // "Equipe projet" and "Description" columns contain duplicate values from
    // "Outil pressentis" and "Statut". Detect this and use "Utilisateur" as team.
    let teamMembers: string[] = []
    let description = ""
    let targetUsers: string | null = null

    const rawTeam = COL_TEAM ? cleanStr(row[COL_TEAM]) : ""
    const rawTools = COL_TOOLS ? cleanStr(row[COL_TOOLS]) : ""
    const rawDesc = COL_DESC ? cleanStr(row[COL_DESC]) : ""
    const rawStatus = COL_STATUS ? cleanStr(row[COL_STATUS]) : ""
    const rawUsers = COL_USERS ? cleanStr(row[COL_USERS]) : ""

    // Detect column duplication: if team == tools and desc == status, columns are shifted
    const isColumnShifted = (
      rawTeam === rawTools &&
      (rawDesc === rawStatus || rawDesc === "Cadrage" || rawDesc === "Conception" || rawDesc === "Priorisation")
    )

    if (isColumnShifted && rawUsers) {
      // Team is actually in "Utilisateur de la solution" column
      teamMembers = splitComma(rawUsers)
      description = "" // no real description available
      targetUsers = null
    } else {
      teamMembers = COL_TEAM ? splitComma(row[COL_TEAM]) : []
      description = COL_DESC ? cleanStr(row[COL_DESC]) : ""
      targetUsers = COL_USERS ? cleanStr(row[COL_USERS]) || null : null
    }

    results.push({
      title,
      description,
      status,
      themes: COL_THEMES ? splitComma(row[COL_THEMES]) : [],
      deliverableType: COL_DELIVERABLE ? cleanStr(row[COL_DELIVERABLE]) || null : null,
      usageType: COL_USAGE ? cleanStr(row[COL_USAGE]) || null : null,
      tools: COL_TOOLS ? cleanStr(row[COL_TOOLS]) || null : null,
      targetUsers,
      benchmarkUrl: COL_BENCH ? cleanStr(row[COL_BENCH]) || null : null,
      journeyUrl: COL_JOURNEY ? cleanStr(row[COL_JOURNEY]) || null : null,
      teamMembers,
    })
  }

  return results
}

function parseAllFiles(importFiles: ImportFile[]): ParsedRow[] {
  const allResults: ParsedRow[] = []

  for (const file of importFiles) {
    const filename = path.basename(file.path)
    console.log(`\n📄 ${filename}`)

    if (file.type === "csv") {
      const rows = parseSingleCSV(file.path, file.filenameStatus)
      console.log(`   ${rows.length} use cases (statut: ${file.filenameStatus || "depuis colonne"})`)
      allResults.push(...rows)
    } else {
      // Excel multi-sheet
      const workbook = XLSX.readFile(file.path, { type: "file" })
      for (const sheetName of workbook.SheetNames) {
        const dbStatus = Object.entries(SHEET_STATUS_MAP).find(
          ([key]) => sheetName.includes(key) || key.includes(sheetName)
        )?.[1]

        if (!dbStatus) {
          console.log(`   Onglet "${sheetName}" -> ignoré`)
          continue
        }

        // Write sheet to temp CSV and parse with same logic
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
        console.log(`   Onglet "${sheetName}" -> ${rows.length} lignes (statut: ${dbStatus})`)

        if (rows.length === 0) continue

        const firstRow = rows[0]
        const COL_TITLE = findColumn(firstRow, "Use cases", "Use case", "Titre")
        const COL_THEMES = findColumn(firstRow, "Themes", "Thèmes")
        const COL_DELIVERABLE = findColumn(firstRow, "Type de livrable")
        const COL_USAGE = findColumn(firstRow, "Type d'utilisation")
        const COL_TOOLS = findColumn(firstRow, "Outil pressentis", "Outils pressentis")
        const COL_TEAM = findColumn(firstRow, "Equipe projet", "Équipe projet")
        const COL_DESC = findColumn(firstRow, "Description/objectifs", "Description")
        const COL_USERS = findColumn(firstRow, "Utilisateur de la solution")
        const COL_BENCH = findColumn(firstRow, "Lien du benchmark solutions existantes", "Benchmark")
        const COL_JOURNEY = findColumn(firstRow, "Lien parcours")

        for (const row of rows) {
          const title = COL_TITLE ? cleanStr(row[COL_TITLE]) : ""
          if (!title) continue

          allResults.push({
            title,
            description: COL_DESC ? cleanStr(row[COL_DESC]) : "",
            status: dbStatus,
            themes: COL_THEMES ? splitComma(row[COL_THEMES]) : [],
            deliverableType: COL_DELIVERABLE ? cleanStr(row[COL_DELIVERABLE]) || null : null,
            usageType: COL_USAGE ? cleanStr(row[COL_USAGE]) || null : null,
            tools: COL_TOOLS ? cleanStr(row[COL_TOOLS]) || null : null,
            targetUsers: COL_USERS ? cleanStr(row[COL_USERS]) || null : null,
            benchmarkUrl: COL_BENCH ? cleanStr(row[COL_BENCH]) || null : null,
            journeyUrl: COL_JOURNEY ? cleanStr(row[COL_JOURNEY]) || null : null,
            teamMembers: COL_TEAM ? splitComma(row[COL_TEAM]) : [],
          })
        }
      }
    }
  }

  return allResults
}

// ---------- Main ----------

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║   Import Airtable -> IA Lab              ║")
  console.log("╚══════════════════════════════════════════╝\n")

  // 1. Find import files
  const importFiles = findImportFiles()
  console.log(`📂 ${importFiles.length} fichier(s) trouvé(s)`)

  // 2. Parse all rows from all files
  const dataRows = parseAllFiles(importFiles)
  if (dataRows.length === 0) {
    console.error("\n❌ Aucune donnée à importer.")
    process.exit(1)
  }

  // 3. Collect unique themes & team members
  const allThemes = new Set<string>()
  const allTeamMembers = new Set<string>()

  for (const row of dataRows) {
    for (const theme of row.themes) allThemes.add(theme)
    for (const member of row.teamMembers) allTeamMembers.add(member)
  }

  console.log(`\n📊 Statistiques:`)
  console.log(`   Use cases: ${dataRows.length}`)
  console.log(`   Thèmes uniques: ${allThemes.size}`)
  console.log(`   Membres d'équipe: ${allTeamMembers.size}`)

  // Status breakdown
  const statusCounts: Record<string, number> = {}
  for (const row of dataRows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
  }
  console.log(`   Répartition:`)
  for (const [s, count] of Object.entries(statusCounts)) {
    console.log(`     ${s}: ${count}`)
  }

  // 4. Connect to Supabase
  const supabase = getSupabase()

  // Quick sanity check: verify the use_cases table is accessible
  let testError: { message: string } | null = null
  try {
    const result = await supabase.from("use_cases").select("id").limit(1)
    testError = result.error
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cause = err instanceof Error && err.cause ? ` (${String((err as Error).cause)})` : ""
    console.error(`\n❌ Impossible de se connecter à Supabase: ${msg}${cause}`)
    console.error("   Vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local")
    process.exit(1)
  }
  if (testError) {
    console.error(`\n❌ Erreur Supabase: ${testError.message}`)
    process.exit(1)
  }

  // Check if extended columns exist
  const { data: testInsert, error: colTestError } = await supabase
    .from("use_cases")
    .select("id")
    .limit(0)

  // Try to detect if deliverable_type column exists by attempting a filtered query
  const { error: colCheckError } = await supabase
    .from("use_cases")
    .select("deliverable_type")
    .limit(0)

  const hasExtendedColumns = !colCheckError
  if (!hasExtendedColumns) {
    console.warn("\n⚠️  Les colonnes étendues (deliverable_type, etc.) n'existent pas encore.")
    console.warn("   Les champs Airtable spécifiques seront ignorés.")
    console.warn("   Pour les importer, appliquez d'abord la migration 002_extend_schema.sql")
    console.warn("")
  } else {
    console.log("\n✅ Colonnes étendues détectées — import complet des champs Airtable")
  }

  // 5. Create tags
  console.log("\n--- Création des tags ---")
  const tagMap = new Map<string, string>()
  let colorIdx = 0

  for (const themeName of allThemes) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("name", themeName)
      .maybeSingle()

    if (existing) {
      tagMap.set(themeName, existing.id)
    } else {
      const color = TAG_COLORS[colorIdx % TAG_COLORS.length]
      colorIdx++
      const { data, error } = await supabase
        .from("tags")
        .insert({ name: themeName, color })
        .select("id")
        .single()

      if (error) {
        console.error(`  ❌ Tag "${themeName}": ${error.message}`)
      } else {
        tagMap.set(themeName, data.id)
        console.log(`  ✅ Tag "${themeName}" (${color})`)
      }
    }
  }

  // 6. Create placeholder profiles for team members
  console.log("\n--- Création des profils équipe ---")
  const profileMap = new Map<string, string>()

  // Check if is_placeholder column exists
  const { error: placeholderCheck } = await supabase
    .from("profiles")
    .select("is_placeholder")
    .limit(0)
  const hasPlaceholderCol = !placeholderCheck

  for (const memberName of allTeamMembers) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("full_name", memberName)
      .maybeSingle()

    if (existing) {
      profileMap.set(memberName, existing.id)
    } else {
      const id = randomUUID()
      const email = `placeholder+${slugify(memberName)}@project-hub.local`
      const profileData: Record<string, unknown> = {
        id,
        full_name: memberName,
        email,
        role: "member",
      }
      if (hasPlaceholderCol) {
        profileData.is_placeholder = true
      }

      const { error } = await supabase.from("profiles").insert(profileData)

      if (error) {
        console.error(`  ❌ Profil "${memberName}": ${error.message}`)
      } else {
        profileMap.set(memberName, id)
        console.log(`  ✅ Profil "${memberName}"`)
      }
    }
  }

  // Create "Import Bot" default owner
  let defaultOwnerId: string
  const { data: botProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("full_name", "Import Bot")
    .maybeSingle()

  if (botProfile) {
    defaultOwnerId = botProfile.id
  } else {
    defaultOwnerId = randomUUID()
    const botData: Record<string, unknown> = {
      id: defaultOwnerId,
      full_name: "Import Bot",
      email: "placeholder+import-bot@project-hub.local",
      role: "member",
    }
    if (hasPlaceholderCol) {
      botData.is_placeholder = true
    }
    await supabase.from("profiles").insert(botData)
    console.log('  ✅ Profil "Import Bot" (owner par défaut)')
  }

  // 7. Import use cases
  console.log("\n--- Import des use cases ---")
  let imported = 0
  let skipped = 0
  let errors = 0

  for (const row of dataRows) {
    // Check if use case already exists (by title)
    const { data: existing } = await supabase
      .from("use_cases")
      .select("id")
      .eq("title", row.title)
      .maybeSingle()

    if (existing) {
      skipped++
      continue
    }

    // Determine owner
    const ownerName = row.teamMembers[0]
    const ownerId = ownerName
      ? profileMap.get(ownerName) || defaultOwnerId
      : defaultOwnerId

    // Build insert data
    const insertData: Record<string, unknown> = {
      title: row.title,
      description: row.description || row.title,
      status: row.status,
      category: "LAB",
      priority: "medium",
      owner_id: ownerId,
      is_published: row.status === "done",
    }

    // Add extended fields if columns exist
    if (hasExtendedColumns) {
      if (row.deliverableType) insertData.deliverable_type = row.deliverableType
      if (row.usageType) insertData.usage_type = row.usageType
      if (row.tools) insertData.tools = row.tools
      if (row.targetUsers) insertData.target_users = row.targetUsers
      if (row.benchmarkUrl) insertData.benchmark_url = row.benchmarkUrl
      if (row.journeyUrl) insertData.journey_url = row.journeyUrl
    }

    const { data: uc, error: ucError } = await supabase
      .from("use_cases")
      .insert(insertData)
      .select("id")
      .single()

    if (ucError) {
      console.error(`  ❌ "${row.title}": ${ucError.message}`)
      errors++
      continue
    }

    const ucId = uc.id

    // Link tags
    for (const theme of row.themes) {
      const tagId = tagMap.get(theme)
      if (tagId) {
        await supabase.from("use_case_tags").insert({
          use_case_id: ucId,
          tag_id: tagId,
        })
      }
    }

    // Link team members
    for (let i = 0; i < row.teamMembers.length; i++) {
      const memberId = profileMap.get(row.teamMembers[i])
      if (memberId) {
        await supabase.from("use_case_members").insert({
          use_case_id: ucId,
          profile_id: memberId,
          role: i === 0 ? "owner" : "contributor",
        })
      }
    }

    imported++
    const tagStr = row.themes.length > 0 ? ` [${row.themes.join(", ")}]` : ""
    const teamStr = row.teamMembers.length > 0 ? ` (${row.teamMembers.join(", ")})` : ""
    console.log(`  ✅ [${row.status}] ${row.title}${tagStr}${teamStr}`)
  }

  // 8. Summary
  console.log("\n╔══════════════════════════════════════════╗")
  console.log("║           Résumé de l'import             ║")
  console.log("╠══════════════════════════════════════════╣")
  console.log(`║  ✅ Importés:  ${String(imported).padStart(3)}                      ║`)
  console.log(`║  ⏭️  Existants: ${String(skipped).padStart(3)}                      ║`)
  console.log(`║  ❌ Erreurs:   ${String(errors).padStart(3)}                      ║`)
  console.log(`║  🏷️  Tags:      ${String(tagMap.size).padStart(3)}                      ║`)
  console.log(`║  👤 Profils:   ${String(profileMap.size).padStart(3)}                      ║`)
  console.log(`║  📰 Publiés:   ${String(dataRows.filter((d) => d.status === "done").length).padStart(3)}                      ║`)
  console.log("╚══════════════════════════════════════════╝")

  console.log("\n🎉 Import terminé!")
}

main().catch((err) => {
  console.error("❌ Erreur fatale:", err)
  process.exit(1)
})
