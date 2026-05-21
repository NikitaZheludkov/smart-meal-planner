const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const currentSchemaPath = path.join(projectRoot, 'current_schema.json')
const targetSchemaPath = path.join(projectRoot, 'pb_schema_ready.json')

const readMaybeBrokenArray = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8')
  const trimmed = raw.trimStart()
  if (trimmed.startsWith('[')) return JSON.parse(raw)
  return JSON.parse('[' + raw)
}

const deepClone = (v) => JSON.parse(JSON.stringify(v))

const ensureField = (collection, field) => {
  if (!collection.fields) collection.fields = []
  if (collection.fields.some((f) => f && f.name === field.name)) return
  collection.fields.push(field)
}

const findCollection = (collections, nameOrId) =>
  collections.find((c) => c?.id === nameOrId || c?.name === nameOrId) || null

const buildTextField = ({ id, name, required = false, min = 0, max = 0, pattern = '', primaryKey = false, system = false, hidden = false }) => ({
  autogeneratePattern: '',
  help: '',
  hidden,
  id,
  max,
  min,
  name,
  pattern,
  presentable: false,
  primaryKey,
  required,
  system,
  type: 'text'
})

const buildNumberField = ({ id, name, required = false, onlyInt = false }) => ({
  help: '',
  hidden: false,
  id,
  max: null,
  min: null,
  name,
  onlyInt,
  presentable: false,
  required,
  system: false,
  type: 'number'
})

const buildBoolField = ({ id, name, required = false }) => ({
  help: '',
  hidden: false,
  id,
  name,
  presentable: false,
  required,
  system: false,
  type: 'bool'
})

const buildDateField = ({ id, name, required = false }) => ({
  help: '',
  hidden: false,
  id,
  max: '',
  min: '',
  name,
  presentable: false,
  required,
  system: false,
  type: 'date'
})

const buildURLField = ({ id, name, required = false }) => ({
  exceptDomains: null,
  help: '',
  hidden: false,
  id,
  name,
  onlyDomains: null,
  presentable: false,
  required,
  system: false,
  type: 'url'
})

const buildRelationField = ({ id, name, collectionId, required = false, minSelect = 0, maxSelect = 1, cascadeDelete = false }) => ({
  cascadeDelete,
  collectionId,
  help: '',
  hidden: false,
  id,
  maxSelect,
  minSelect,
  name,
  presentable: false,
  required,
  system: false,
  type: 'relation'
})

const buildBaseCollection = ({ id, name, rules, fields, indexes = [] }, templates) => ({
  id,
  listRule: rules.listRule ?? null,
  viewRule: rules.viewRule ?? null,
  createRule: rules.createRule ?? null,
  updateRule: rules.updateRule ?? null,
  deleteRule: rules.deleteRule ?? null,
  name,
  type: 'base',
  fields: [deepClone(templates.id), ...fields, deepClone(templates.created), deepClone(templates.updated)],
  indexes,
  system: false
})

const main = () => {
  const current = readMaybeBrokenArray(currentSchemaPath)

  const anyBase = current.find((c) => c?.type === 'base' && c?.fields?.some((f) => f?.name === 'created')) || null
  if (!anyBase) throw new Error('Не найден шаблон base-коллекции в current_schema.json')

  const idFieldTemplate = deepClone(anyBase.fields.find((f) => f?.name === 'id'))
  const createdFieldTemplate = deepClone(anyBase.fields.find((f) => f?.name === 'created'))
  const updatedFieldTemplate = deepClone(anyBase.fields.find((f) => f?.name === 'updated'))

  const templates = { id: idFieldTemplate, created: createdFieldTemplate, updated: updatedFieldTemplate }

  const users = findCollection(current, '_pb_users_auth_') || findCollection(current, 'users')
  if (!users) throw new Error('Не найдена коллекция users в current_schema.json')

  ensureField(users, buildTextField({ id: 'smp_first_name', name: 'first_name', required: false, min: 0, max: 255 }))
  ensureField(users, buildTextField({ id: 'smp_username', name: 'username', required: false, min: 0, max: 255 }))
  ensureField(users, buildURLField({ id: 'smp_avatar_url', name: 'avatar_url', required: false }))
  ensureField(users, buildTextField({ id: 'smp_telegram_id', name: 'telegram_id', required: false, min: 0, max: 255 }))
  ensureField(users, buildRelationField({ id: 'smp_user_household', name: 'household', collectionId: 'smp_households', required: false, minSelect: 0, maxSelect: 1, cascadeDelete: false }))

  const newCollections = [
    buildBaseCollection(
      {
        id: 'smp_households',
        name: 'households',
        rules: {
          listRule: 'id = @request.auth.household',
          viewRule: 'id = @request.auth.household',
          createRule: "@request.auth.id != '' && @request.data.owner = @request.auth.id",
          updateRule: 'owner = @request.auth.id',
          deleteRule: 'owner = @request.auth.id'
        },
        fields: [
          buildTextField({ id: 'smp_households_name', name: 'name', required: true, min: 1, max: 255 }),
          buildRelationField({ id: 'smp_households_owner', name: 'owner', collectionId: '_pb_users_auth_', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: false }),
          buildNumberField({ id: 'smp_households_start_day', name: 'start_day', required: false, onlyInt: true }),
          buildNumberField({ id: 'smp_households_period_length', name: 'period_length', required: false, onlyInt: true }),
          buildNumberField({ id: 'smp_households_default_portions', name: 'default_portions', required: false, onlyInt: true }),
          buildTextField({ id: 'smp_households_invite_code', name: 'invite_code', required: false, min: 0, max: 6, pattern: '^[0-9]{6}$' })
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_households_invite_code ON households (invite_code)',
          'CREATE INDEX idx_households_owner ON households (owner)'
        ]
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_products',
        name: 'products',
        rules: {
          listRule: 'household = @request.auth.household',
          viewRule: 'household = @request.auth.household',
          createRule: 'household = @request.auth.household',
          updateRule: 'household = @request.auth.household',
          deleteRule: 'household = @request.auth.household'
        },
        fields: [
          buildRelationField({ id: 'smp_products_household', name: 'household', collectionId: 'smp_households', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildTextField({ id: 'smp_products_name', name: 'name', required: true, min: 1, max: 255 }),
          buildTextField({ id: 'smp_products_category', name: 'category', required: false, min: 0, max: 255 }),
          buildTextField({ id: 'smp_products_unit', name: 'unit', required: false, min: 0, max: 64 })
        ],
        indexes: [
          'CREATE INDEX idx_products_household ON products (household)',
          'CREATE INDEX idx_products_household_name ON products (household, name)'
        ]
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_meal_types',
        name: 'meal_types',
        rules: {
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''"
        },
        fields: [
          buildTextField({ id: 'smp_meal_types_name', name: 'name', required: true, min: 1, max: 255 }),
          buildNumberField({ id: 'smp_meal_types_sort_order', name: 'sort_order', required: false, onlyInt: true })
        ],
        indexes: ['CREATE INDEX idx_meal_types_sort_order ON meal_types (sort_order)']
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_dish_types',
        name: 'dish_types',
        rules: {
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''"
        },
        fields: [
          buildTextField({ id: 'smp_dish_types_name', name: 'name', required: true, min: 1, max: 255 }),
          buildNumberField({ id: 'smp_dish_types_sort_order', name: 'sort_order', required: false, onlyInt: true })
        ],
        indexes: ['CREATE INDEX idx_dish_types_sort_order ON dish_types (sort_order)']
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_dish_tags',
        name: 'dish_tags',
        rules: {
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''"
        },
        fields: [
          buildTextField({ id: 'smp_dish_tags_name', name: 'name', required: true, min: 1, max: 255 }),
          buildTextField({ id: 'smp_dish_tags_icon', name: 'icon', required: false, min: 0, max: 32 }),
          buildTextField({ id: 'smp_dish_tags_category', name: 'category', required: false, min: 0, max: 64 }),
          buildNumberField({ id: 'smp_dish_tags_sort_order', name: 'sort_order', required: false, onlyInt: true })
        ],
        indexes: ['CREATE INDEX idx_dish_tags_sort_order ON dish_tags (sort_order)']
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_dishes',
        name: 'dishes',
        rules: {
          listRule: 'household = @request.auth.household',
          viewRule: 'household = @request.auth.household',
          createRule: 'household = @request.auth.household',
          updateRule: 'household = @request.auth.household',
          deleteRule: 'household = @request.auth.household'
        },
        fields: [
          buildRelationField({ id: 'smp_dishes_household', name: 'household', collectionId: 'smp_households', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildTextField({ id: 'smp_dishes_name', name: 'name', required: true, min: 1, max: 255 }),
          buildRelationField({ id: 'smp_dishes_meal_type', name: 'meal_type', collectionId: 'smp_meal_types', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: false }),
          buildRelationField({ id: 'smp_dishes_dish_type', name: 'dish_type', collectionId: 'smp_dish_types', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: false }),
          buildRelationField({ id: 'smp_dishes_tags', name: 'tags', collectionId: 'smp_dish_tags', required: false, minSelect: 0, maxSelect: 99, cascadeDelete: false }),
          buildTextField({ id: 'smp_dishes_description', name: 'description', required: false, min: 0, max: 0 }),
          buildNumberField({ id: 'smp_dishes_kcal', name: 'kcal', required: false, onlyInt: false }),
          buildNumberField({ id: 'smp_dishes_protein', name: 'protein', required: false, onlyInt: false }),
          buildNumberField({ id: 'smp_dishes_fat', name: 'fat', required: false, onlyInt: false }),
          buildNumberField({ id: 'smp_dishes_carbs', name: 'carbs', required: false, onlyInt: false }),
          buildBoolField({ id: 'smp_dishes_is_batch', name: 'is_batch', required: false }),
          buildNumberField({ id: 'smp_dishes_batch_yield', name: 'batch_yield', required: false, onlyInt: true }),
          buildURLField({ id: 'smp_dishes_image_url', name: 'image_url', required: false })
        ],
        indexes: [
          'CREATE INDEX idx_dishes_household ON dishes (household)',
          'CREATE INDEX idx_dishes_household_created ON dishes (household, created)'
        ]
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_ingredients',
        name: 'ingredients',
        rules: {
          listRule: 'household = @request.auth.household',
          viewRule: 'household = @request.auth.household',
          createRule: 'household = @request.auth.household',
          updateRule: 'household = @request.auth.household',
          deleteRule: 'household = @request.auth.household'
        },
        fields: [
          buildRelationField({ id: 'smp_ingredients_household', name: 'household', collectionId: 'smp_households', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildRelationField({ id: 'smp_ingredients_dish', name: 'dish', collectionId: 'smp_dishes', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildRelationField({ id: 'smp_ingredients_product', name: 'product', collectionId: 'smp_products', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: false }),
          buildNumberField({ id: 'smp_ingredients_amount', name: 'amount', required: false, onlyInt: false })
        ],
        indexes: [
          'CREATE INDEX idx_ingredients_household ON ingredients (household)',
          'CREATE INDEX idx_ingredients_household_dish ON ingredients (household, dish)',
          'CREATE INDEX idx_ingredients_product ON ingredients (product)'
        ]
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_plan',
        name: 'plan',
        rules: {
          listRule: 'household = @request.auth.household',
          viewRule: 'household = @request.auth.household',
          createRule: 'household = @request.auth.household',
          updateRule: 'household = @request.auth.household',
          deleteRule: 'household = @request.auth.household'
        },
        fields: [
          buildRelationField({ id: 'smp_plan_household', name: 'household', collectionId: 'smp_households', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildDateField({ id: 'smp_plan_date', name: 'date', required: true }),
          buildRelationField({ id: 'smp_plan_meal_type', name: 'meal_type', collectionId: 'smp_meal_types', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: false }),
          buildRelationField({ id: 'smp_plan_dish', name: 'dish', collectionId: 'smp_dishes', required: false, minSelect: 0, maxSelect: 1, cascadeDelete: false }),
          buildRelationField({ id: 'smp_plan_product', name: 'product', collectionId: 'smp_products', required: false, minSelect: 0, maxSelect: 1, cascadeDelete: false }),
          buildNumberField({ id: 'smp_plan_portions', name: 'portions', required: false, onlyInt: true }),
          buildBoolField({ id: 'smp_plan_ignore_shopping', name: 'ignore_shopping', required: false })
        ],
        indexes: [
          'CREATE INDEX idx_plan_household ON plan (household)',
          'CREATE INDEX idx_plan_household_date_meal_type ON plan (household, date, meal_type)',
          'CREATE INDEX idx_plan_dish ON plan (dish)',
          'CREATE INDEX idx_plan_product ON plan (product)'
        ]
      },
      templates
    ),
    buildBaseCollection(
      {
        id: 'smp_shopping_cart',
        name: 'shopping_cart',
        rules: {
          listRule: 'household = @request.auth.household',
          viewRule: 'household = @request.auth.household',
          createRule: 'household = @request.auth.household',
          updateRule: 'household = @request.auth.household',
          deleteRule: 'household = @request.auth.household'
        },
        fields: [
          buildRelationField({ id: 'smp_shopping_cart_household', name: 'household', collectionId: 'smp_households', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildRelationField({ id: 'smp_shopping_cart_product', name: 'product', collectionId: 'smp_products', required: true, minSelect: 1, maxSelect: 1, cascadeDelete: true }),
          buildBoolField({ id: 'smp_shopping_cart_is_checked', name: 'is_checked', required: false }),
          buildDateField({ id: 'smp_shopping_cart_updated_at', name: 'updated_at', required: false })
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_shopping_cart_household_product ON shopping_cart (household, product)',
          'CREATE INDEX idx_shopping_cart_household ON shopping_cart (household)'
        ]
      },
      templates
    )
  ]

  for (const nc of newCollections) {
    const existing = findCollection(current, nc.name)
    if (existing) {
      nc.id = existing.id
      nc.system = existing.system === true
      const idx = current.findIndex((c) => c?.id === existing.id)
      current[idx] = nc
    } else {
      current.push(nc)
    }
  }

  fs.writeFileSync(targetSchemaPath, JSON.stringify(current, null, 2))
  console.log(`Wrote ${path.relative(projectRoot, targetSchemaPath)} (collections: ${current.length})`)
}

main()

