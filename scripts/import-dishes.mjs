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
  console.error(`Не найден файл ${credsPath}. Создай его вручную со своими данными:\n{"email": "твой email", "password": "твой пароль"}`);
  process.exit(1);
}

const pb = new PocketBase('https://grecha-app.ru');
await pb.collection('users').authWithPassword(creds.email, creds.password);

const householdId = pb.authStore.model.household;
if (!householdId) throw new Error('У аккаунта нет household');

const dishTypes = await pb.collection('dish_types').getFullList();
const dt = (name) => {
  const found = dishTypes.find((t) => t.name === name);
  if (!found) throw new Error(`dish_type не найден: ${name}`);
  return found.id;
};

const mealTypes = await pb.collection('meal_types').getFullList();
const mt = (name) => {
  const found = mealTypes.find((t) => t.name === name);
  if (!found) throw new Error(`meal_type не найден: ${name}`);
  return found.id;
};

// Продукты, которых ещё нет в базе — создаём перед блюдами.
// { name: [existingNameToReuse?, category, unit] } — если первое значение
// не null, используем уже существующий продукт с этим именем вместо создания нового.
const NEW_PRODUCTS = [
  ['Сосиски или ветчина', 'Мясо, птица, рыба', 'Кг'],
  ['Йогурт греческий', 'Молочные продукты', 'Упак'],
  ['Булочки коломенские', 'Бакалея и хлеб', 'Шт'],
  ['Сыр фета', 'Молочные продукты', 'Кг'],
  ['Горошек замороженный', 'Заморозка', 'Кг'],
  ['Хашбраун', 'Заморозка', 'Шт'],
  ['Фарш мясной', 'Мясо, птица, рыба', 'Кг'],
  ['Бекон', 'Мясо, птица, рыба', 'Кг'],
  ['Кетчуп', 'Соусы', 'Кг'],
  ['Печень куриная', 'Мясо, птица, рыба', 'Кг'],
  ['Сливки 10%', 'Молочные продукты', 'Л'],
  ['Булгур', 'Бакалея и хлеб', 'Кг'],
  ['Капуста квашеная', 'Овощи и фрукты', 'Кг'],
  ['Соус томатный', 'Соусы', 'Шт'],
  ['Лук красный', 'Овощи и фрукты', 'Кг'],
  ['Кинза', 'Овощи и фрукты', 'Кг'],
  ['Морковь по-корейски', 'Овощи и фрукты', 'Кг'],
  ['Корнишоны', 'Овощи и фрукты', 'Кг'],
  ['Мидии', 'Мясо, птица, рыба', 'Кг'],
  ['Молоко кокосовое', 'Бакалея и хлеб', 'Л'],
  ['Паста том-ям', 'Соусы', 'Кг'],
  ['Лайм', 'Овощи и фрукты', 'Шт'],
  ['Фасоль сухая', 'Бакалея и хлеб', 'Кг'],
  ['Филе индейки', 'Мясо, птица, рыба', 'Кг'],
  ['Листы лазаньи', 'Бакалея и хлеб', 'Упак'],
  ['Крабовые палочки', 'Мясо, птица, рыба', 'Упак'],
  ['Лук зеленый', 'Овощи и фрукты', 'Кг']
];

// Имена ингредиентов из списка -> имя уже существующего продукта в базе
// (разное написание того же самого товара, либо единица не совпадала —
// пересчитано под уже существующий unit продукта).
const RENAME = {
  'Лепешка': 'Лепешки пшеничные',
  'Сыр ломтиками': 'Сыр плавленый ломтиками',
  'Яйца': 'Яйцо куриное',
  'Бедро куриное': 'Куриное бедро',
  'Грудка куриная': 'Куриное филе',
  'Орехи грецкие': 'Грецкий орех',
  'Масло сливочное': 'Сливочное масло'
};

const existingProducts = await pb.collection('products').getFullList({ filter: `household="${householdId}"` });
const byName = new Map(existingProducts.map((p) => [p.name, p]));

let createdProducts = 0;
for (const [name, category, unit] of NEW_PRODUCTS) {
  if (byName.has(name)) continue;
  const rec = await pb.collection('products').create({ household: householdId, name, category, unit });
  byName.set(name, rec);
  createdProducts++;
}

const p = (rawName) => {
  const name = RENAME[rawName] || rawName;
  const found = byName.get(name);
  if (!found) throw new Error(`Продукт не найден: ${rawName} (искали как "${name}")`);
  return found;
};

const dishes = [
  { name: 'Кесадилья завтр', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Лепешка', amount: 2 },
      { product: 'Сыр ломтиками', amount: 2 },
      { product: 'Сосиски или ветчина', amount: 0.10 },
      { product: 'Яйца', amount: 2 }
    ] },
  { name: 'Овсянка с томатами', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Овсяные хлопья', amount: 0.10 },
      { product: 'Помидоры', amount: 0.15 },
      { product: 'Чеснок', amount: 2 },
      { product: 'Сыр твердый', amount: 0.05 },
      { product: 'Яйца', amount: 2 },
      { product: 'Йогурт греческий', amount: 0.5 }
    ] },
  { name: 'Овсяноблин', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Овсяные хлопья', amount: 0.10 },
      { product: 'Яйца', amount: 2 },
      { product: 'Сосиски или ветчина', amount: 0.10 },
      { product: 'Сыр ломтиками', amount: 2 }
    ] },
  { name: 'Скрембл', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Яйца', amount: 4 },
      { product: 'Сыр ломтиками', amount: 2 },
      { product: 'Булочки коломенские', amount: 2 }
    ] },
  { name: 'Шакшука', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Яйца', amount: 4 },
      { product: 'Помидоры', amount: 0.15 },
      { product: 'Перец болгарский', amount: 0.1 },
      { product: 'Сыр фета', amount: 0.05 },
      { product: 'Йогурт греческий', amount: 0.5 },
      { product: 'Лук репчатый', amount: 0.05 }
    ] },
  { name: 'Английский завтрак', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Яйца', amount: 4 },
      { product: 'Фасоль консервированная', amount: 0.5 },
      { product: 'Горошек замороженный', amount: 0.20 },
      { product: 'Сосиски или ветчина', amount: 0.30 },
      { product: 'Хашбраун', amount: 2 },
      { product: 'Булочки коломенские', amount: 2 }
    ] },
  { name: 'Утренний ролл', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Фарш мясной', amount: 0.40 },
      { product: 'Хашбраун', amount: 2 },
      { product: 'Яйца', amount: 3 },
      { product: 'Бекон', amount: 0.04 },
      { product: 'Лепешка', amount: 2 },
      { product: 'Кетчуп', amount: 0.03 },
      { product: 'Чеснок', amount: 2 },
      { product: 'Сыр ломтиками', amount: 3 }
    ] },
  { name: 'Кесадилья с фасолью', dish_type: dt('Горячее'), meal_type: mt('Завтрак'), batch_yield: 2,
    ingredients: [
      { product: 'Лепешка', amount: 2 },
      { product: 'Фасоль консервированная', amount: 0.5 },
      { product: 'Майонез', amount: 0.045 },
      { product: 'Сыр твердый', amount: 0.045 },
      { product: 'Сосиски или ветчина', amount: 0.12 }
    ] },
  { name: 'Печеночные оладьи', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Печень куриная', amount: 0.50 },
      { product: 'Морковь', amount: 0.1 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Яйца', amount: 1 },
      { product: 'Сметана', amount: 0.2 }
    ] },
  { name: 'Печень в сливках', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Печень куриная', amount: 0.50 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Сливки 10%', amount: 0.40 }
    ] },
  { name: 'Плов с булгуром', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Булгур', amount: 0.14 },
      { product: 'Бедро куриное', amount: 0.18 },
      { product: 'Перец болгарский', amount: 0.1 },
      { product: 'Морковь', amount: 0.1 },
      { product: 'Помидоры', amount: 0.15 }
    ] },
  { name: 'Капуста тушеная', dish_type: dt('Гарнир'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Капуста квашеная', amount: 0.30 },
      { product: 'Соус томатный', amount: 1 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Морковь', amount: 0.1 },
      { product: 'Сосиски или ветчина', amount: 0.20 }
    ] },
  { name: 'Шаурма', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Грудка куриная', amount: 0.30 },
      { product: 'Перец болгарский', amount: 0.1 },
      { product: 'Лук красный', amount: 0.05 },
      { product: 'Кинза', amount: 0.02 },
      { product: 'Морковь по-корейски', amount: 0.05 },
      { product: 'Огурцы', amount: 0.05 },
      { product: 'Корнишоны', amount: 0.05 },
      { product: 'Йогурт греческий', amount: 0.5 },
      { product: 'Сыр ломтиками', amount: 2 },
      { product: 'Лаваш', amount: 2 }
    ] },
  { name: 'Мидии том-ям', dish_type: dt('Суп'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Мидии', amount: 0.50 },
      { product: 'Молоко кокосовое', amount: 0.40 },
      { product: 'Паста том-ям', amount: 0.05 },
      { product: 'Кинза', amount: 0.02 },
      { product: 'Чеснок', amount: 2 },
      { product: 'Лайм', amount: 0.5 }
    ] },
  { name: 'Лобио', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Фасоль сухая', amount: 0.25 },
      { product: 'Орехи грецкие', amount: 0.05 },
      { product: 'Кинза', amount: 0.05 },
      { product: 'Соус томатный', amount: 0.5 },
      { product: 'Лук красный', amount: 0.1 }
    ] },
  { name: 'Котлеты из индейки', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 4,
    ingredients: [
      { product: 'Филе индейки', amount: 0.68 },
      { product: 'Сыр твердый', amount: 0.10 },
      { product: 'Укроп', amount: 0.10 },
      { product: 'Яйца', amount: 4 },
      { product: 'Майонез', amount: 0.10 }
    ] },
  { name: 'Лазанья', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 2,
    ingredients: [
      { product: 'Фарш мясной', amount: 0.20 },
      { product: 'Листы лазаньи', amount: 0.5 },
      { product: 'Масло сливочное', amount: 0.08 },
      { product: 'Соус томатный', amount: 0.5 },
      { product: 'Сыр твердый', amount: 0.05 }
    ] },
  { name: 'Крабовые котлеты', dish_type: dt('Горячее'), meal_type: mt('Обед'), batch_yield: 4,
    ingredients: [
      { product: 'Крабовые палочки', amount: 1 },
      { product: 'Яйца', amount: 3 },
      { product: 'Сыр твердый', amount: 0.10 },
      { product: 'Лук зеленый', amount: 0.02 }
    ] }
];

let createdDishes = 0;
let createdIngredients = 0;
let skipped = 0;

for (const d of dishes) {
  const existing = await pb.collection('dishes').getFirstListItem(`household="${householdId}" && name="${d.name}"`).catch(() => null);
  if (existing) {
    console.log(`пропущено (уже есть): ${d.name}`);
    skipped++;
    continue;
  }

  const record = await pb.collection('dishes').create({
    household: householdId,
    name: d.name,
    dish_type: d.dish_type,
    meal_type: d.meal_type,
    tags: [],
    batch_yield: d.batch_yield,
    is_batch: false,
    needs_side_dish: false
  });
  createdDishes++;

  for (const ing of d.ingredients) {
    const product = p(ing.product);
    await pb.collection('ingredients').create({
      household: householdId,
      dish: record.id,
      product: product.id,
      amount: ing.amount
    });
    createdIngredients++;
  }

  console.log(`создано: ${d.name} (${d.ingredients.length} ингредиентов, ${d.batch_yield} порц.)`);
}

console.log(`\nИтого: создано продуктов ${createdProducts}, блюд ${createdDishes}, ингредиентов ${createdIngredients}, пропущено блюд ${skipped}`);
