import * as fs from "fs"
import * as path from "path"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

// Load env
const envPath = path.resolve(process.cwd(), ".env.local")
const envContent = fs.readFileSync(envPath, "utf-8")
const env: Record<string, string> = {}
for (const line of envContent.split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const eq = t.indexOf("=")
  if (eq === -1) continue
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function fix() {
  // Read the abandoned CSV to get exact titles
  const csvPath = path.resolve(process.cwd(), "BDD UCs livrés Airtable - 5 - Abandonnés.csv")
  const csvStr = fs.readFileSync(csvPath, "utf-8")
  const wb = XLSX.read(csvStr, { type: "string" })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])

  console.log(`Found ${rows.length} abandoned use cases to fix\n`)

  for (const row of rows) {
    const title = String(row["Use cases"] || "").trim()
    if (!title) continue

    console.log(`Fixing: "${title.substring(0, 70)}..."`)
    const { data, error } = await supabase
      .from("use_cases")
      .update({ status: "abandoned", is_published: false })
      .eq("title", title)
      .select("id")

    if (error) {
      console.error(`  ❌ ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`  ✅ Updated to abandoned`)
    } else {
      console.log(`  ⚠️  Not found in database`)
    }
  }

  // Also fix encoding: re-import all use cases with correct UTF-8 titles
  // First, let's check how many have mojibake
  const { data: allUc } = await supabase.from("use_cases").select("id, title").order("created_at")
  const mojibake = (allUc || []).filter((uc) => uc.title.includes("Ã"))
  console.log(`\n${mojibake.length} use cases with encoding issues found`)

  if (mojibake.length > 0) {
    // Read all CSVs with correct encoding to build title mapping
    const root = process.cwd()
    const csvFiles = fs.readdirSync(root).filter((f) => f.endsWith(".csv") && f.includes("Airtable"))

    const correctTitles: string[] = []
    for (const f of csvFiles) {
      const content = fs.readFileSync(path.resolve(root, f), "utf-8")
      const wb2 = XLSX.read(content, { type: "string" })
      const rows2 = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb2.Sheets[wb2.SheetNames[0]])
      for (const r of rows2) {
        const t = String(r["Use cases"] || "").trim()
        if (t) correctTitles.push(t)
      }
    }

    // For each mojibake title, find the correct UTF-8 version
    let fixed = 0
    for (const uc of mojibake) {
      // Try to find matching correct title by comparing first few ASCII chars
      const badTitle = uc.title
      // Decode: replace common mojibake patterns
      let decoded = badTitle
        .replace(/Ã©/g, "é").replace(/Ã¨/g, "è").replace(/Ãª/g, "ê")
        .replace(/Ã\u00a0/g, "à").replace(/Ã /g, "à").replace(/Ã¢/g, "â")
        .replace(/Ã´/g, "ô").replace(/Ã®/g, "î").replace(/Ã¯/g, "ï")
        .replace(/Ã¹/g, "ù").replace(/Ã»/g, "û").replace(/Ã¼/g, "ü")
        .replace(/Ã§/g, "ç").replace(/Å\u0093/g, "œ")
        .replace(/â\u0080\u0099/g, "'").replace(/â\u0080\u0093/g, "–")
        .replace(/â\u0080\u009c/g, "\u201c").replace(/â\u0080\u009d/g, "\u201d")
        .replace(/Ã\u0083Â©/g, "é")

      if (decoded !== badTitle) {
        const { error: updateErr } = await supabase
          .from("use_cases")
          .update({ title: decoded })
          .eq("id", uc.id)

        if (!updateErr) {
          fixed++
        }
      }
    }
    console.log(`Fixed encoding for ${fixed} use cases`)
  }

  console.log("\nDone!")
}

fix().catch(console.error)
