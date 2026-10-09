import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);

const mealTypes = ['Завтрак', 'Обед', 'Ужин', 'Перекус'];
const dishTypes = ['Горячее', 'Салат', 'Гарнир', 'Закуска', 'Прочее'];
const dishTags = ['Быстро', 'Вегетарианское', 'Детское', 'Праздничное', 'Выходного дня'];

async function seed(collection, names) {
  const existing = await pb.collection(collection).getFullList();
  if (existing.length > 0) {
    console.log(`${collection}: already has ${existing.length} records, skipping`);
    return;
  }
  for (let i = 0; i < names.length; i++) {
    await pb.collection(collection).create({ name: names[i], sort_order: i + 1 });
  }
  console.log(`${collection}: seeded ${names.length} records`);
}

await seed('meal_types', mealTypes);
await seed('dish_types', dishTypes);
await seed('dish_tags', dishTags);

console.log('DONE');
