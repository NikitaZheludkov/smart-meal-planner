import PocketBase from 'pocketbase'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

const escapeFilterValue = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const loadJson = async (fileName) => {
  const filePath = join(migrationDir, fileName)
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${fileName}`)
  return parsed
}

const ensureCollection = async (body) => {
  try {
    return await pb.collections.getOne(body.name)
  } catch (e) {
    return await pb.collections.create(body)
  }
}

const ensureField = async (collectionName, field) => {
  const col = await pb.collections.getOne(collectionName)
  const exists = (col.fields || []).some((f) => f.name === field.name)
  if (exists) return col
  return await pb.collections.update(col.id, { fields: [...(col.fields || []), field] })
}

const upsertBySupabaseId = async (collectionName, supabaseId, body) => {
  const filter = `supabase_id="${escapeFilterValue(supabaseId)}"`
  try {
    const existing = await pb.collection(collectionName).getFirstListItem(filter)
    const updated = await pb.collection(collectionName).update(existing.id, body)
    return updated
  } catch (e) {
    const created = await pb.collection(collectionName).create(body)
    return created
  }
}

const warn = (msg) => process.stderr.write(`${msg}\n`)

const mapOptional = (map, oldId, label, ctx) => {
  if (!oldId) return null
  const v = map.get(oldId)
  if (!v) {
    warn(`WARN: Missing mapping for ${label}: ${oldId}. Setting null (${ctx})`)
    return null
  }
  return v
}

const mapRequired = (map, oldId, label, ctx) => {
  if (!oldId) {
    warn(`WARN: Missing required id for ${label}. Skipping (${ctx})`)
    return null
  }
  const v = map.get(oldId)
  if (!v) {
    warn(`WARN: Missing mapping for ${label}: ${oldId}. Skipping (${ctx})`)
    return null
  }
  return v
}

const idMap = {
  profiles: new Map(),
  households: new Map(),
  products: new Map(),
  dishes: new Map(),
  ingredients: new Map(),
  dish_tags: new Map(),
  meal_types: new Map(),
  dish_types: new Map(),
  plan: new Map(),
  shopping_cart: new Map()
}

const dishTypes = await loadJson('dish_types.json')
const mealTypes = await loadJson('meal_types.json')
const dishTags = await loadJson('dish_tags.json')
const profiles = await loadJson('profiles.json')
const households = await loadJson('households.json')
const products = await loadJson('products.json')
const dishes = await loadJson('dishes.json')
const ingredients = await loadJson('ingredients.json')
const plan = await loadJson('plan.json')
const shoppingCart = await loadJson('shopping_cart.json')

await ensureCollection({
  name: 'dish_types',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'sort_order', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_dish_types_supabase_id` ON `dish_types` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'meal_types',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'sort_order', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_meal_types_supabase_id` ON `meal_types` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'dish_tags',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'icon', type: 'text' },
    { name: 'category', type: 'text' },
    { name: 'sort_order', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_dish_tags_supabase_id` ON `dish_tags` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'profiles',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'username', type: 'text' },
    { name: 'first_name', type: 'text' },
    { name: 'avatar_url', type: 'text' },
    { name: 'telegram_id', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_profiles_supabase_id` ON `profiles` (`supabase_id`)'
  ]
})

const dishTypesCol = await pb.collections.getOne('dish_types')
const mealTypesCol = await pb.collections.getOne('meal_types')
const dishTagsCol = await pb.collections.getOne('dish_tags')
const profilesCol = await pb.collections.getOne('profiles')

await ensureCollection({
  name: 'households',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'created_at', type: 'text' },
    { name: 'name', type: 'text' },
    { name: 'invite_code', type: 'text' },
    {
      name: 'owner_profile',
      type: 'relation',
      collectionId: profilesCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'period_length', type: 'number', noDecimal: true },
    { name: 'start_day', type: 'number', noDecimal: true },
    { name: 'default_portions', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_households_supabase_id` ON `households` (`supabase_id`)'
  ]
})

const householdsCol = await pb.collections.getOne('households')

await ensureField('profiles', {
  name: 'household',
  type: 'relation',
  collectionId: householdsCol.id,
  maxSelect: 1,
  cascadeDelete: false
})

await ensureCollection({
  name: 'products',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'created_at', type: 'text' },
    {
      name: 'household',
      type: 'relation',
      collectionId: householdsCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'name', type: 'text', required: true },
    { name: 'category', type: 'text' },
    { name: 'unit', type: 'text' }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_products_supabase_id` ON `products` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'dishes',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'created_at', type: 'text' },
    {
      name: 'household',
      type: 'relation',
      collectionId: householdsCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text' },
    { name: 'image_url', type: 'text' },
    { name: 'kcal', type: 'number' },
    { name: 'protein', type: 'number' },
    { name: 'fat', type: 'number' },
    { name: 'carbs', type: 'number' },
    {
      name: 'dish_type',
      type: 'relation',
      collectionId: dishTypesCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    {
      name: 'meal_type',
      type: 'relation',
      collectionId: mealTypesCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'is_batch', type: 'bool' },
    { name: 'batch_yield', type: 'number', noDecimal: true }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_dishes_supabase_id` ON `dishes` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'ingredients',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    {
      name: 'dish',
      type: 'relation',
      collectionId: (await pb.collections.getOne('dishes')).id,
      maxSelect: 1,
      cascadeDelete: true
    },
    {
      name: 'product',
      type: 'relation',
      collectionId: (await pb.collections.getOne('products')).id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'amount', type: 'number' }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_ingredients_supabase_id` ON `ingredients` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'plan',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    { name: 'created_at', type: 'text' },
    {
      name: 'household',
      type: 'relation',
      collectionId: householdsCol.id,
      maxSelect: 1,
      cascadeDelete: true
    },
    { name: 'date', type: 'text', required: true },
    {
      name: 'meal_type',
      type: 'relation',
      collectionId: mealTypesCol.id,
      maxSelect: 1,
      cascadeDelete: false
    },
    {
      name: 'dish',
      type: 'relation',
      collectionId: (await pb.collections.getOne('dishes')).id,
      maxSelect: 1,
      cascadeDelete: false
    },
    {
      name: 'product',
      type: 'relation',
      collectionId: (await pb.collections.getOne('products')).id,
      maxSelect: 1,
      cascadeDelete: false
    },
    { name: 'portions', type: 'number', noDecimal: true },
    { name: 'ignore_shopping', type: 'bool' }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_plan_supabase_id` ON `plan` (`supabase_id`)'
  ]
})

await ensureCollection({
  name: 'shopping_cart',
  type: 'base',
  fields: [
    { name: 'supabase_id', type: 'text', required: true },
    {
      name: 'product',
      type: 'relation',
      collectionId: (await pb.collections.getOne('products')).id,
      maxSelect: 1,
      cascadeDelete: false
    },
    {
      name: 'household',
      type: 'relation',
      collectionId: householdsCol.id,
      maxSelect: 1,
      cascadeDelete: true
    },
    { name: 'is_checked', type: 'bool' },
    { name: 'updated_at', type: 'text' }
  ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_shopping_cart_supabase_id` ON `shopping_cart` (`supabase_id`)',
    'CREATE UNIQUE INDEX `idx_shopping_cart_household_product` ON `shopping_cart` (`household`, `product`)'
  ]
})

for (const row of dishTypes) {
  const rec = await upsertBySupabaseId('dish_types', row.id, {
    supabase_id: row.id,
    name: row.name,
    sort_order: row.sort_order ?? null
  })
  idMap.dish_types.set(row.id, rec.id)
}

for (const row of mealTypes) {
  const rec = await upsertBySupabaseId('meal_types', row.id, {
    supabase_id: row.id,
    name: row.name,
    sort_order: row.sort_order ?? null
  })
  idMap.meal_types.set(row.id, rec.id)
}

for (const row of dishTags) {
  const rec = await upsertBySupabaseId('dish_tags', row.id, {
    supabase_id: row.id,
    name: row.name,
    icon: row.icon ?? null,
    category: row.category ?? null,
    sort_order: row.sort_order ?? null
  })
  idMap.dish_tags.set(row.id, rec.id)
}

for (const row of profiles) {
  const rec = await upsertBySupabaseId('profiles', row.id, {
    supabase_id: row.id,
    username: row.username ?? null,
    first_name: row.first_name ?? null,
    avatar_url: row.avatar_url ?? null,
    telegram_id: row.telegram_id ?? null
  })
  idMap.profiles.set(row.id, rec.id)
}

for (const row of households) {
  const ownerProfile = mapOptional(idMap.profiles, row.owner_id, 'households.owner_id', `households ${row.id}`)
  const rec = await upsertBySupabaseId('households', row.id, {
    supabase_id: row.id,
    created_at: row.created_at ?? null,
    name: row.name ?? null,
    invite_code: row.invite_code ?? null,
    owner_profile: ownerProfile,
    period_length: row.period_length ?? null,
    start_day: row.start_day ?? null,
    default_portions: row.default_portions ?? null
  })
  idMap.households.set(row.id, rec.id)
}

for (const row of profiles) {
  const profileId = mapRequired(idMap.profiles, row.id, 'profiles.id', `profiles ${row.id}`)
  if (!profileId) continue
  const householdId = mapOptional(idMap.households, row.household_id, 'profiles.household_id', `profiles ${row.id}`)
  if (!householdId) continue
  await pb.collection('profiles').update(profileId, { household: householdId })
}

for (const row of products) {
  const householdId = mapRequired(idMap.households, row.household_id, 'products.household_id', `products ${row.id}`)
  if (!householdId) continue
  const rec = await upsertBySupabaseId('products', row.id, {
    supabase_id: row.id,
    created_at: row.created_at ?? null,
    household: householdId,
    name: row.name,
    category: row.category ?? null,
    unit: row.unit ?? null
  })
  idMap.products.set(row.id, rec.id)
}

for (const row of dishes) {
  const householdId = mapRequired(idMap.households, row.household_id, 'dishes.household_id', `dishes ${row.id}`)
  if (!householdId) continue
  const dishTypeId = mapRequired(idMap.dish_types, row.dish_type_id, 'dishes.dish_type_id', `dishes ${row.id}`)
  if (!dishTypeId) continue
  const mealTypeId = mapRequired(idMap.meal_types, row.meal_type_id, 'dishes.meal_type_id', `dishes ${row.id}`)
  if (!mealTypeId) continue
  const rec = await upsertBySupabaseId('dishes', row.id, {
    supabase_id: row.id,
    created_at: row.created_at ?? null,
    household: householdId,
    name: row.name,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    kcal: row.kcal ?? null,
    protein: row.protein ?? null,
    fat: row.fat ?? null,
    carbs: row.carbs ?? null,
    dish_type: dishTypeId,
    meal_type: mealTypeId,
    is_batch: Boolean(row.is_batch),
    batch_yield: row.batch_yield ?? null
  })
  idMap.dishes.set(row.id, rec.id)
}

for (const row of ingredients) {
  const dishId = mapRequired(idMap.dishes, row.dish_id, 'ingredients.dish_id', `ingredients ${row.id}`)
  if (!dishId) continue
  const productId = mapRequired(idMap.products, row.product_id, 'ingredients.product_id', `ingredients ${row.id}`)
  if (!productId) continue
  const rec = await upsertBySupabaseId('ingredients', row.id, {
    supabase_id: row.id,
    dish: dishId,
    product: productId,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount)
  })
  idMap.ingredients.set(row.id, rec.id)
}

for (const row of plan) {
  const householdId = mapRequired(idMap.households, row.household_id, 'plan.household_id', `plan ${row.id}`)
  if (!householdId) continue
  const mealTypeId = mapRequired(idMap.meal_types, row.meal_type_id, 'plan.meal_type_id', `plan ${row.id}`)
  if (!mealTypeId) continue
  const dishId = row.dish_id
    ? mapRequired(idMap.dishes, row.dish_id, 'plan.dish_id', `plan ${row.id}`)
    : null
  if (row.dish_id && !dishId) continue
  const productId = row.product_id
    ? mapRequired(idMap.products, row.product_id, 'plan.product_id', `plan ${row.id}`)
    : null
  if (row.product_id && !productId) continue
  const rec = await upsertBySupabaseId('plan', row.id, {
    supabase_id: row.id,
    created_at: row.created_at ?? null,
    date: row.date,
    household: householdId,
    meal_type: mealTypeId,
    dish: dishId,
    product: productId,
    portions: row.portions ?? null,
    ignore_shopping: Boolean(row.ignore_shopping)
  })
  idMap.plan.set(row.id, rec.id)
}

for (const row of shoppingCart) {
  const productId = mapRequired(idMap.products, row.product_id, 'shopping_cart.product_id', `shopping_cart ${row.id}`)
  if (!productId) continue
  const householdId = mapRequired(
    idMap.households,
    row.household_id,
    'shopping_cart.household_id',
    `shopping_cart ${row.id}`
  )
  if (!householdId) continue
  const rec = await upsertBySupabaseId('shopping_cart', row.id, {
    supabase_id: row.id,
    product: productId,
    household: householdId,
    is_checked: Boolean(row.is_checked),
    updated_at: row.updated_at ?? null
  })
  idMap.shopping_cart.set(row.id, rec.id)
}

process.stdout.write('Migration completed\n')
