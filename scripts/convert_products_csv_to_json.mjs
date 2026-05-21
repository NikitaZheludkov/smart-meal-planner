import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const parseCsvLine = (line) => {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1]
        if (next === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

const main = async () => {
  const args = process.argv.slice(2)
  const inputPath = args[0]
  const outputPath = args[1]
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/convert_products_csv_to_json.mjs <input.csv> <output.json>')
  }

  const raw = await readFile(inputPath, 'utf8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) throw new Error('Empty CSV')

  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const idx = new Map(header.map((h, i) => [h, i]))
  const must = (name) => {
    const v = idx.get(name)
    if (v === undefined) throw new Error(`Missing column: ${name}`)
    return v
  }

  const idI = must('id')
  const createdAtI = idx.get('created_at')
  const nameI = must('name')
  const categoryI = idx.get('category')
  const unitI = idx.get('unit')
  const householdI = idx.get('household_id')

  const rows = []
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const id = (cols[idI] || '').trim()
    const name = (cols[nameI] || '').trim()
    if (!id || !name) continue
    const obj = {
      id,
      name,
      category: categoryI === undefined ? null : (cols[categoryI] || '').trim() || null,
      unit: unitI === undefined ? null : (cols[unitI] || '').trim() || null
    }
    if (createdAtI !== undefined) obj.created_at = (cols[createdAtI] || '').trim() || null
    if (householdI !== undefined) obj.household_id = (cols[householdI] || '').trim() || null
    rows.push(obj)
  }

  await writeFile(outputPath, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  process.stdout.write(`Wrote ${rows.length} rows to ${outputPath}\n`)
}

try {
  await main()
} catch (e) {
  process.stderr.write(`${e?.stack || e}\n`)
  process.exit(1)
}
