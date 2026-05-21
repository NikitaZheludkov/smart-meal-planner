import { readFile, writeFile } from 'node:fs/promises'

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

const toNumberOrNull = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const main = async () => {
  const args = process.argv.slice(2)
  const inputPath = args[0]
  const outputPath = args[1]
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/convert_ingredients_csv_to_json.mjs <input.csv> <output.json>')
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
  const dishI = must('dish_id')
  const productI = must('product_id')
  const amountI = idx.get('amount')

  const rows = []
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const id = (cols[idI] || '').trim()
    const dish_id = (cols[dishI] || '').trim()
    const product_id = (cols[productI] || '').trim()
    if (!id || !dish_id || !product_id) continue
    rows.push({
      id,
      dish_id,
      product_id,
      amount: amountI === undefined ? null : toNumberOrNull(cols[amountI])
    })
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

