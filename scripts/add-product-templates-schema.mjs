import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
console.log('Authenticated as superuser');

// Эталонный список продуктов "по умолчанию" для новых семей — общий для
// всех, не привязан к household. Читать может любой авторизованный
// пользователь (нужно для сидирования через хук), писать — только
// суперюзер через админку/скрипт.
let templatesCol;
try {
  templatesCol = await pb.collections.getOne('product_templates');
  console.log(`exists: product_templates (${templatesCol.id})`);
} catch {
  templatesCol = await pb.collections.create({
    name: 'product_templates',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'category', type: 'text', required: false, max: 100 },
      { name: 'unit', type: 'text', required: false, max: 50 },
      { name: 'sort_order', type: 'number', required: false },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });
  console.log(`created: product_templates (${templatesCol.id})`);
}

console.log('DONE');
