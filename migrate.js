import PocketBase from 'pocketbase'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const USER_ID = 'hvhj2p7qwyrm9p6'

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
const warn = (msg) => process.stderr.write(`${msg}\n`)

const rootDir = dirname(fileURLToPath(import.meta.url))
const migrationDir = join(rootDir, '_migration')

await loadDotEnv(join(rootDir, '.env'))

const PB_URL =
  process.env.PB_URL ||
  process.env.POCKETBASE_URL ||
  process.env.VITE_POCKETBASE_URL ||
  'http://127.0.0.1:8090'

const ADMIN_EMAIL = mustEnv('PB_ADMIN_EMAIL')
const ADMIN_PASSWORD = mustEnv('PB_ADMIN_PASSWORD')

const pb = new PocketBase(PB_URL)
await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD)

const purgeCollection = async (collectionName) => {
  for (;;) {
    const page = await pb.collection(collectionName).getList(1, 200, { fields: 'id' })
    if (!page.items.length) return
    for (const item of page.items) {
      await pb.collection(collectionName).delete(item.id)
    }
  }
}

await purgeCollection('ingredients')
await purgeCollection('dishes')
await purgeCollection('products')

const loadJson = async (fileName) => {
  const filePath = join(migrationDir, fileName)
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${fileName}`)
  return parsed
}

const toSingleRelation = (v) => {
  if (!v) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

const detectUserOwnerField = (fields, usersCollectionId) => {
  const candidates = ['user', 'owner', 'created_by', 'creator', 'author']
  const byName = new Map((fields || []).map((f) => [f.name, f]))
  for (const name of candidates) {
    const f = byName.get(name)
    if (!f) continue
    if (f.type !== 'relation') continue
    if (f.collectionId !== usersCollectionId) continue
    if (f.maxSelect !== 1 && f.maxSelect !== undefined && f.maxSelect !== null) continue
    return name
  }
  for (const f of fields || []) {
    if (f.type !== 'relation') continue
    if (f.collectionId !== usersCollectionId) continue
    if (f.maxSelect !== 1 && f.maxSelect !== undefined && f.maxSelect !== null) continue
    return f.name
  }
  return null
}

const getCollectionInfo = async (collectionName, usersCollectionId) => {
  const col = await pb.collections.getOne(collectionName)
  const fields = col.fields || []
  const byName = new Map(fields.map((f) => [f.name, f]))
  const householdField = byName.has('household') ? 'household' : null
  const ownerField = detectUserOwnerField(fields, usersCollectionId)
  const requiredFields = new Set(fields.filter((f) => f.required).map((f) => f.name))
  return { col, byName, householdField, ownerField, requiredFields }
}

const ensureHouseholdForUser = async (userId) => {
  const filter = `owner="${escapeFilterValue(userId)}"`
  try {
    const existing = await pb.collection('households').getFirstListItem(filter)
    return existing.id
  } catch {
    const inviteCode = String(Math.floor(100000 + Math.random() * 900000))
    const created = await pb.collection('households').create({
      name: 'Default',
      owner: userId,
      invite_code: inviteCode
    })
    return created.id
  }
}

const usersCol = await pb.collections.getOne('users')

const user = await pb.collection('users').getOne(USER_ID)
let householdId = toSingleRelation(user.household)

const productsInfo = await getCollectionInfo('products', usersCol.id)
const dishesInfo = await getCollectionInfo('dishes', usersCol.id)
const ingredientsInfo = await getCollectionInfo('ingredients', usersCol.id)

const anyNeedsHousehold =
  Boolean(productsInfo.householdField) ||
  Boolean(dishesInfo.householdField) ||
  Boolean(ingredientsInfo.householdField)

if (anyNeedsHousehold && !householdId) {
  householdId = await ensureHouseholdForUser(USER_ID)
  if (productsInfo.ownerField || dishesInfo.ownerField || ingredientsInfo.ownerField) {
    await pb.collection('users').update(USER_ID, { household: householdId })
  } else if (productsInfo.householdField || dishesInfo.householdField || ingredientsInfo.householdField) {
    await pb.collection('users').update(USER_ID, { household: householdId })
  }
}

if (anyNeedsHousehold && !householdId) {
  throw new Error('Unable to resolve household id for import')
}

const buildOwnerPayload = (info) => {
  const payload = {}
  if (info.ownerField) payload[info.ownerField] = USER_ID
  if (info.householdField) payload[info.householdField] = householdId
  return payload
}

const normalizeKey = (v) => String(v ?? '').trim().toLowerCase()

const DEFAULT_MEAL_TYPE_NAME = 'Обед'
const DEFAULT_DISH_TYPE_NAME = 'Прочее'

const normalizeDishTypeName = (oldName) => {
  const k = normalizeKey(oldName)
  if (!k) return DEFAULT_DISH_TYPE_NAME
  if (k === 'супы' || k === 'суп') return 'Суп'
  if (k === 'основные' || k === 'основное') return 'Основное'
  if (k === 'салаты' || k === 'салат') return 'Салат'
  if (k === 'гарнир') return 'Гарнир'
  return DEFAULT_DISH_TYPE_NAME
}

const listAll = async (collectionName) => {
  return await pb.collection(collectionName).getFullList({ batch: 200 })
}

const mealTypesPB = await listAll('meal_types')
const dishTypesPB = await listAll('dish_types')

const mealTypeNameToId = new Map(mealTypesPB.map((r) => [normalizeKey(r.name), r.id]))
const dishTypeNameToId = new Map(dishTypesPB.map((r) => [normalizeKey(r.name), r.id]))

const mustTypeIdByName = (map, collectionName, name) => {
  const id = map.get(normalizeKey(name))
  if (!id) throw new Error(`Missing ${collectionName} record with name: ${name}`)
  return id
}

const mealTypesOld = await loadJson('meal_types.json')
const dishTypesOld = await loadJson('dish_types.json')

const mealTypeOldIdToName = new Map(mealTypesOld.map((r) => [r.id, r.name]))
const dishTypeOldIdToName = new Map(dishTypesOld.map((r) => [r.id, r.name]))

const products = await loadJson('products.json')
const dishes = await loadJson('dishes.json')
const ingredients = await loadJson('ingredients.json')

const productIdMap = new Map()
const dishIdMap = new Map()

let createdProducts = 0
let createdDishes = 0
let createdIngredients = 0
let skippedIngredients = 0

for (const row of products) {
  const rec = await pb.collection('products').create({
    ...buildOwnerPayload(productsInfo),
    name: row.name,
    category: row.category ?? null,
    unit: row.unit ?? null
  })
  productIdMap.set(row.id, rec.id)
  createdProducts++
}

for (const row of dishes) {
  const oldMealName = row.meal_type_id ? mealTypeOldIdToName.get(row.meal_type_id) : null
  if (row.meal_type_id && !oldMealName) {
    console.warn(`WARN: Unknown meal_type_id ${row.meal_type_id} for dish ${row.id}. Using ${DEFAULT_MEAL_TYPE_NAME}`)
  }
  if (!row.meal_type_id) {
    console.warn(`WARN: dishes.meal_type_id is null for dish ${row.id}. Using ${DEFAULT_MEAL_TYPE_NAME}`)
  }
  const mealTypeName = oldMealName ?? DEFAULT_MEAL_TYPE_NAME
  const mealTypeId = mustTypeIdByName(mealTypeNameToId, 'meal_types', mealTypeName)

  const oldDishName = row.dish_type_id ? dishTypeOldIdToName.get(row.dish_type_id) : null
  if (row.dish_type_id && !oldDishName) {
    console.warn(`WARN: Unknown dish_type_id ${row.dish_type_id} for dish ${row.id}. Using ${DEFAULT_DISH_TYPE_NAME}`)
  }
  if (!row.dish_type_id) {
    console.warn(`WARN: dishes.dish_type_id is null for dish ${row.id}. Using ${DEFAULT_DISH_TYPE_NAME}`)
  }
  const dishTypeName = normalizeDishTypeName(oldDishName ?? DEFAULT_DISH_TYPE_NAME)
  const dishTypeId = mustTypeIdByName(dishTypeNameToId, 'dish_types', dishTypeName)

  const rec = await pb.collection('dishes').create({
    ...buildOwnerPayload(dishesInfo),
    name: row.name,
    meal_type: mealTypeId,
    dish_type: dishTypeId,
    description: row.description ?? null,
    kcal: row.kcal ?? null,
    protein: row.protein ?? null,
    fat: row.fat ?? null,
    carbs: row.carbs ?? null,
    is_batch: Boolean(row.is_batch),
    batch_yield: row.batch_yield ?? null,
    image_url: row.image_url ?? null
  })
  dishIdMap.set(row.id, rec.id)
  createdDishes++
}

for (const row of ingredients) {
  const dishId = dishIdMap.get(row.dish_id)
  if (!dishId) {
    warn(`WARN: Missing dish mapping for ingredients.dish_id ${row.dish_id} (row ${row.id}). Skipping`)
    skippedIngredients++
    continue
  }

  let productId = productIdMap.get(row.product_id)
  if (!productId) {
    throw new Error(
      `Missing product mapping for ingredients.product_id ${row.product_id} (row ${row.id}). ` +
        `Fix _migration/products.json to include this product id.`
    )
  }

  const amountNumber =
    row.amount === null || row.amount === undefined || row.amount === ''
      ? null
      : Number(row.amount)

  await pb.collection('ingredients').create({
    ...buildOwnerPayload(ingredientsInfo),
    dish: dishId,
    product: productId,
    amount: Number.isFinite(amountNumber) ? amountNumber : null
  })
  createdIngredients++
}

process.stdout.write(
  `Migration completed (products=${createdProducts}, dishes=${createdDishes}, ingredients=${createdIngredients}, ingredients_skipped=${skippedIngredients})\n`
)
