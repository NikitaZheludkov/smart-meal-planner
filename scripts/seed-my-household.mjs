import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASS);

const householdId = process.argv[2];
const templates = await pb.collection('product_templates').getFullList({ sort: 'sort_order' });
const existing = await pb.collection('products').getFullList({ filter: `household="${householdId}"` });
const existingNames = new Set(existing.map(p => p.name.toLowerCase()));

let created = 0;
for (const tpl of templates) {
  if (existingNames.has(tpl.name.toLowerCase())) continue;
  await pb.collection('products').create({ household: householdId, name: tpl.name, category: tpl.category, unit: tpl.unit });
  created++;
}
console.log(`created ${created} of ${templates.length} templates`);
