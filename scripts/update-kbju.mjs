import PocketBase from 'pocketbase';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credsPath = join(__dirname, '.import-creds.json');

let creds;
try {
  creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
} catch (e) {
  console.error(`Не найден файл ${credsPath}. Создай его со своими данными:\n{"email": "твой email", "password": "твой пароль"}`);
  process.exit(1);
}

const pb = new PocketBase('https://grecha-app.ru');
await pb.collection('users').authWithPassword(creds.email, creds.password);

const householdId = pb.authStore.model.household;
if (!householdId) throw new Error('У аккаунта нет household');

// КБЖУ на 1 порцию (посчитано вручную по составу и типовой пищевой ценности
// ингредиентов на весь объём партии, затем поделено на batch_yield).
const KBJU = {
  'Кесадилья завтр': { kcal: 432, protein: 21, fat: 24, carbs: 32 },
  'Овсянка с томатами': { kcal: 400, protein: 24, fat: 18, carbs: 36 },
  'Овсяноблин': { kcal: 435, protein: 22, fat: 24, carbs: 32 },
  'Скрембл': { kcal: 374, protein: 21, fat: 18, carbs: 32 },
  'Шакшука': { kcal: 301, protein: 22, fat: 19, carbs: 12 },
  'Английский завтрак': { kcal: 971, protein: 48, fat: 53, carbs: 72 },
  'Утренний ролл': { kcal: 1032, protein: 58, fat: 66, carbs: 48 },
  'Кесадилья с фасолью': { kcal: 646, protein: 24, fat: 40, carbs: 47 },
  'Печеночные оладьи': { kcal: 632, protein: 57, fat: 38, carbs: 14 },
  'Печень в сливках': { kcal: 606, protein: 57, fat: 35, carbs: 15 },
  'Плов с булгуром': { kcal: 452, protein: 25, fat: 16, carbs: 63 },
  'Капуста тушеная': { kcal: 431, protein: 17, fat: 23, carbs: 39 },
  'Шаурма': { kcal: 590, protein: 61, fat: 15, carbs: 51 },
  'Мидии том-ям': { kcal: 690, protein: 35, fat: 54, carbs: 21 },
  'Лобио': { kcal: 654, protein: 32, fat: 18, carbs: 95 },
  'Котлеты из индейки': { kcal: 533, protein: 55, fat: 33, carbs: 3 },
  'Лазанья': { kcal: 1097, protein: 40, fat: 58, carbs: 100 },
  'Крабовые котлеты': { kcal: 195, protein: 16, fat: 11, carbs: 6 }
};

let updated = 0;
let notFound = 0;

for (const [name, values] of Object.entries(KBJU)) {
  const dish = await pb.collection('dishes').getFirstListItem(`household="${householdId}" && name="${name}"`).catch(() => null);
  if (!dish) {
    console.log(`не найдено: ${name}`);
    notFound++;
    continue;
  }
  await pb.collection('dishes').update(dish.id, values);
  console.log(`обновлено: ${name} — ${values.kcal} ккал, Б${values.protein} Ж${values.fat} У${values.carbs}`);
  updated++;
}

console.log(`\nИтого: обновлено ${updated}, не найдено ${notFound}`);
