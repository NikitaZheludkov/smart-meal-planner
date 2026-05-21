const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const schemaPath = path.join(projectRoot, 'pb_schema_ready.json')

const data = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
if (!Array.isArray(data)) {
  throw new Error('pb_schema_ready.json должен быть JSON-массивом коллекций')
}

const targetNames = new Set([
  'households',
  'products',
  'dishes',
  'ingredients',
  'plan',
  'shopping_cart',
  'meal_types',
  'dish_types',
  'dish_tags'
])

let updated = 0

for (const c of data) {
  if (!c || typeof c !== 'object') continue
  const isOur =
    (typeof c.id === 'string' && c.id.startsWith('smp_')) ||
    (typeof c.name === 'string' && targetNames.has(c.name))

  if (!isOur) continue

  c.listRule = ''
  c.viewRule = ''
  c.createRule = ''
  c.updateRule = ''
  c.deleteRule = ''
  updated++
}

fs.writeFileSync(schemaPath, JSON.stringify(data, null, 2))
console.log(`Updated rules in ${updated} collections`)

