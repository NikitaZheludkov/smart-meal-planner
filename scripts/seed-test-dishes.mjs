import PocketBase from 'pocketbase';

const pb = new PocketBase('https://grecha-app.ru');
await pb.collection('users').authWithPassword('test-auth-check@example.com', 'TestPass123');

const householdId = pb.authStore.model.household;
if (!householdId) throw new Error('У тестового пользователя нет household');

const products = await pb.collection('products').getFullList({ filter: `household="${householdId}"` });
const byName = new Map(products.map((p) => [p.name, p]));
const p = (name) => {
  const found = byName.get(name);
  if (!found) throw new Error(`Продукт не найден: ${name}`);
  return found;
};

const dishTypes = await pb.collection('dish_types').getFullList();
const dt = (name) => dishTypes.find((t) => t.name === name)?.id;

const mealTypes = await pb.collection('meal_types').getFullList();
const mt = (name) => mealTypes.find((t) => t.name === name)?.id;

const tags = await pb.collection('dish_tags').getFullList();
const tg = (name) => tags.find((t) => t.name === name)?.id;

const dishes = [
  {
    name: 'Омлет с сыром',
    dish_type: dt('Горячее'), meal_type: mt('Завтрак'), tags: [tg('Быстро')].filter(Boolean),
    ingredients: [
      { product: 'Яйцо куриное', amount: 3 },
      { product: 'Сыр твердый', amount: 0.05 },
      { product: 'Сливочное масло', amount: 0.02 },
      { product: 'Соль', amount: 2 }
    ]
  },
  {
    name: 'Овсянка с бананом',
    dish_type: dt('Горячее'), meal_type: mt('Завтрак'), tags: [tg('Быстро'), tg('Вегетарианское')].filter(Boolean),
    ingredients: [
      { product: 'Овсяные хлопья', amount: 0.1 },
      { product: 'Молоко', amount: 0.25 },
      { product: 'Бананы', amount: 0.15 },
      { product: 'Сахар', amount: 0.01 }
    ]
  },
  {
    name: 'Борщ',
    dish_type: dt('Суп'), meal_type: mt('Обед'), tags: [],
    ingredients: [
      { product: 'Свинина мякоть', amount: 0.3 },
      { product: 'Капуста белокочанная', amount: 0.3 },
      { product: 'Картофель', amount: 0.3 },
      { product: 'Морковь', amount: 0.1 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Томатная паста', amount: 0.05 }
    ]
  },
  {
    name: 'Куриный суп с лапшой',
    dish_type: dt('Суп'), meal_type: mt('Обед'), tags: [tg('Быстро')].filter(Boolean),
    ingredients: [
      { product: 'Куриное филе', amount: 0.3 },
      { product: 'Макароны', amount: 0.15 },
      { product: 'Морковь', amount: 0.1 },
      { product: 'Лук репчатый', amount: 0.05 }
    ]
  },
  {
    name: 'Гречка с курицей',
    dish_type: dt('Горячее'), meal_type: mt('Обед'), tags: [],
    ingredients: [
      { product: 'Гречка', amount: 0.2 },
      { product: 'Куриное бедро', amount: 0.4 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Морковь', amount: 0.1 }
    ]
  },
  {
    name: 'Цезарь с курицей',
    dish_type: dt('Салат'), meal_type: mt('Обед'), tags: [],
    ingredients: [
      { product: 'Куриное филе', amount: 0.2 },
      { product: 'Помидоры', amount: 0.15 },
      { product: 'Сыр твердый', amount: 0.05 },
      { product: 'Лаваш', amount: 1 },
      { product: 'Майонез', amount: 0.03 }
    ]
  },
  {
    name: 'Плов',
    dish_type: dt('Горячее'), meal_type: mt('Ужин'), tags: [tg('Праздничное')].filter(Boolean),
    ingredients: [
      { product: 'Рис', amount: 0.3 },
      { product: 'Говядина мякоть', amount: 0.4 },
      { product: 'Морковь', amount: 0.15 },
      { product: 'Лук репчатый', amount: 0.1 },
      { product: 'Масло подсолнечное', amount: 0.05 }
    ]
  },
  {
    name: 'Паста карбонара',
    dish_type: dt('Горячее'), meal_type: mt('Ужин'), tags: [tg('Быстро')].filter(Boolean),
    ingredients: [
      { product: 'Макароны', amount: 0.25 },
      { product: 'Сливочное масло', amount: 0.03 },
      { product: 'Сыр твердый', amount: 0.05 },
      { product: 'Яйцо куриное', amount: 2 }
    ]
  },
  {
    name: 'Творожная запеканка',
    dish_type: dt('Десерт'), meal_type: mt('Перекус'), tags: [tg('Детское')].filter(Boolean),
    ingredients: [
      { product: 'Творог', amount: 0.4 },
      { product: 'Яйцо куриное', amount: 2 },
      { product: 'Сахар', amount: 0.05 },
      { product: 'Мука пшеничная', amount: 0.05 },
      { product: 'Сметана', amount: 0.05 }
    ]
  },
  {
    name: 'Пельмени со сметаной',
    dish_type: dt('Горячее'), meal_type: mt('Ужин'), tags: [tg('Быстро')].filter(Boolean),
    ingredients: [
      { product: 'Пельмени', amount: 0.4 },
      { product: 'Сметана', amount: 0.05 }
    ]
  }
];

let createdDishes = 0;
let createdIngredients = 0;

for (const d of dishes) {
  const existing = await pb.collection('dishes').getFirstListItem(`household="${householdId}" && name="${d.name}"`).catch(() => null);
  if (existing) {
    console.log(`пропущено (уже есть): ${d.name}`);
    continue;
  }

  const record = await pb.collection('dishes').create({
    household: householdId,
    name: d.name,
    dish_type: d.dish_type,
    meal_type: d.meal_type,
    tags: d.tags,
    batch_yield: 1
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

  console.log(`создано: ${d.name} (${d.ingredients.length} ингредиентов)`);
}

console.log(`\nИтого: ${createdDishes} блюд, ${createdIngredients} ингредиентов`);
