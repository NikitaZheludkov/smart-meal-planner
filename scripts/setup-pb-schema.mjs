import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
console.log('Authenticated as superuser');

const byName = {};

async function getOrCreate(def) {
  try {
    const existing = await pb.collections.getOne(def.name);
    console.log(`exists: ${def.name} (${existing.id})`);
    byName[def.name] = existing;
    return existing;
  } catch {
    const created = await pb.collections.create(def);
    console.log(`created: ${def.name} (${created.id})`);
    byName[def.name] = created;
    return created;
  }
}

const householdRule = 'household = @request.auth.household';

const usersColRef = await pb.collections.getOne('users');
console.log(`users collection id: ${usersColRef.id}`);

// 1. households
await getOrCreate({
  name: 'households',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100 },
    { name: 'owner', type: 'relation', required: true, collectionId: usersColRef.id, maxSelect: 1 },
    { name: 'invite_code', type: 'text', required: true, max: 6 },
    { name: 'start_day', type: 'number', required: false },
    { name: 'period_length', type: 'number', required: false },
    { name: 'default_portions', type: 'number', required: false }
  ],
  indexes: ['CREATE UNIQUE INDEX idx_households_invite_code ON households (invite_code)'],
  listRule: '@request.auth.id != "" && (owner = @request.auth.id || id = @request.auth.household)',
  viewRule: '@request.auth.id != "" && (owner = @request.auth.id || id = @request.auth.household)',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != "" && owner = @request.auth.id',
  deleteRule: '@request.auth.id != "" && owner = @request.auth.id'
});

// 2. meal_types (shared dictionary, readable by any authenticated user)
await getOrCreate({
  name: 'meal_types',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100 },
    { name: 'sort_order', type: 'number', required: false }
  ],
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: null,
  updateRule: null,
  deleteRule: null
});

// 3. dish_types
await getOrCreate({
  name: 'dish_types',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100 },
    { name: 'sort_order', type: 'number', required: false }
  ],
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: null,
  updateRule: null,
  deleteRule: null
});

// 4. dish_tags
await getOrCreate({
  name: 'dish_tags',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100 },
    { name: 'sort_order', type: 'number', required: false }
  ],
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: null,
  updateRule: null,
  deleteRule: null
});

// 5. products
await getOrCreate({
  name: 'products',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 200 },
    { name: 'category', type: 'text', required: false, max: 100 },
    { name: 'unit', type: 'text', required: false, max: 50 },
    { name: 'household', type: 'relation', required: true, collectionId: byName['households'].id, maxSelect: 1 }
  ],
  listRule: householdRule,
  viewRule: householdRule,
  createRule: householdRule,
  updateRule: householdRule,
  deleteRule: householdRule
});

// 6. dishes
await getOrCreate({
  name: 'dishes',
  type: 'base',
  fields: [
    { name: 'name', type: 'text', required: true, max: 200 },
    { name: 'dish_type', type: 'relation', required: false, collectionId: byName['dish_types'].id, maxSelect: 1 },
    { name: 'meal_type', type: 'relation', required: false, collectionId: byName['meal_types'].id, maxSelect: 1 },
    { name: 'tags', type: 'relation', required: false, collectionId: byName['dish_tags'].id, maxSelect: 999 },
    { name: 'description', type: 'text', required: false, max: 5000 },
    { name: 'kcal', type: 'number', required: false },
    { name: 'protein', type: 'number', required: false },
    { name: 'fat', type: 'number', required: false },
    { name: 'carbs', type: 'number', required: false },
    { name: 'is_batch', type: 'bool', required: false },
    { name: 'batch_yield', type: 'number', required: false },
    { name: 'image_url', type: 'text', required: false, max: 2000 },
    { name: 'household', type: 'relation', required: true, collectionId: byName['households'].id, maxSelect: 1 }
  ],
  listRule: householdRule,
  viewRule: householdRule,
  createRule: householdRule,
  updateRule: householdRule,
  deleteRule: householdRule
});

// 7. ingredients
await getOrCreate({
  name: 'ingredients',
  type: 'base',
  fields: [
    { name: 'household', type: 'relation', required: true, collectionId: byName['households'].id, maxSelect: 1 },
    { name: 'dish', type: 'relation', required: true, collectionId: byName['dishes'].id, maxSelect: 1 },
    { name: 'product', type: 'relation', required: true, collectionId: byName['products'].id, maxSelect: 1 },
    { name: 'amount', type: 'number', required: false }
  ],
  listRule: householdRule,
  viewRule: householdRule,
  createRule: householdRule,
  updateRule: householdRule,
  deleteRule: householdRule
});

// 8. plan
await getOrCreate({
  name: 'plan',
  type: 'base',
  fields: [
    { name: 'date', type: 'date', required: true },
    { name: 'meal_type', type: 'relation', required: true, collectionId: byName['meal_types'].id, maxSelect: 1 },
    { name: 'household', type: 'relation', required: true, collectionId: byName['households'].id, maxSelect: 1 },
    { name: 'dish', type: 'relation', required: false, collectionId: byName['dishes'].id, maxSelect: 1 },
    { name: 'product', type: 'relation', required: false, collectionId: byName['products'].id, maxSelect: 1 },
    { name: 'portions', type: 'number', required: false },
    { name: 'ignore_shopping', type: 'bool', required: false }
  ],
  listRule: householdRule,
  viewRule: householdRule,
  createRule: householdRule,
  updateRule: householdRule,
  deleteRule: householdRule
});

// 9. shopping_cart
await getOrCreate({
  name: 'shopping_cart',
  type: 'base',
  fields: [
    { name: 'household', type: 'relation', required: true, collectionId: byName['households'].id, maxSelect: 1 },
    { name: 'product', type: 'relation', required: true, collectionId: byName['products'].id, maxSelect: 1 },
    { name: 'is_checked', type: 'bool', required: false },
    { name: 'updated_at', type: 'date', required: false }
  ],
  listRule: householdRule,
  viewRule: householdRule,
  createRule: householdRule,
  updateRule: householdRule,
  deleteRule: householdRule
});

// 10. Patch users collection: add household relation + first_name
const usersCol = usersColRef;
const existingFieldNames = new Set(usersCol.fields.map((f) => f.name));
const newFields = [...usersCol.fields];

if (!existingFieldNames.has('first_name')) {
  newFields.push({ name: 'first_name', type: 'text', required: false, max: 100 });
}
if (!existingFieldNames.has('household')) {
  newFields.push({ name: 'household', type: 'relation', required: false, collectionId: byName['households'].id, maxSelect: 1 });
}

await pb.collections.update(usersCol.id, {
  fields: newFields,
  listRule: '@request.auth.id != "" && household = @request.auth.household',
  viewRule: '@request.auth.id != "" && (id = @request.auth.id || household = @request.auth.household)',
  updateRule: '@request.auth.id != "" && id = @request.auth.id'
});
console.log('users collection patched');

console.log('DONE');
