import PocketBase from 'pocketbase'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const USER_ID = '11q1r9fiz9cskca'

const loadDotEnv = async (filePath) => {
  try {
    const raw = await readFile(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value
      }
    }
  } catch {
    return
  }
}

const mustEnv = (key) => {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

const escapeFilterValue = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const main = async () => {
  const rootDir = dirname(fileURLToPath(import.meta.url))
  await loadDotEnv(join(rootDir, '..', '.env'))

  const PB_URL =
    process.env.PB_URL ||
    process.env.POCKETBASE_URL ||
    process.env.VITE_POCKETBASE_URL ||
    'http://127.0.0.1:8090'

  const ADMIN_EMAIL = mustEnv('PB_ADMIN_EMAIL')
  const ADMIN_PASSWORD = mustEnv('PB_ADMIN_PASSWORD')

  const pb = new PocketBase(PB_URL)
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD)

  const households = await pb.collection('households').getFullList({
    batch: 200,
    filter: `owner="${escapeFilterValue(USER_ID)}"`,
    fields: 'id'
  })

  for (const h of households) {
    await pb.collection('households').delete(h.id)
  }

  await pb.collection('users').delete(USER_ID)
  process.stdout.write('Deleted test user\n')
}

try {
  await main()
} catch (e) {
  process.stderr.write(`${e?.stack || e}\n`)
  process.exit(1)
}

