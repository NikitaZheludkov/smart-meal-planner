import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);

const collections = [
  'households', 'meal_types', 'dish_types', 'dish_tags',
  'products', 'dishes', 'ingredients', 'plan', 'shopping_cart'
];

for (const name of collections) {
  const col = await pb.collections.getOne(name);
  const existing = new Set(col.fields.map((f) => f.name));
  const newFields = [...col.fields];

  if (!existing.has('created')) {
    newFields.push({ name: 'created', type: 'autodate', onCreate: true, onUpdate: false });
  }
  if (!existing.has('updated')) {
    newFields.push({ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true });
  }

  if (newFields.length !== col.fields.length) {
    await pb.collections.update(col.id, { fields: newFields });
    console.log(`${name}: added created/updated`);
  } else {
    console.log(`${name}: already has created/updated`);
  }
}

console.log('DONE');
