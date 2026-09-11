import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASS);

// Полный список пользователя (72 позиции), единицы скорректированы по
// согласованному плану: добавлена "Г" для специй/малых количеств (Соль,
// Перец чёрный молотый, Сода пищевая, Кунжут семена, Горчица), консервы
// переведены с Кг на Шт (банками, а не на вес). Строки живут прямо в .mjs
// файле (записан инструментом с гарантированным UTF-8), без прохода через
// shell-интерполяцию — иначе кириллица бьётся на Windows.
const existing = await pb.collection('product_templates').getFullList();
for (const item of existing) {
  await pb.collection('product_templates').delete(item.id);
}
console.log(`removed ${existing.length} old templates`);

const templates = [
  // Овощи и фрукты
  { name: 'Картофель', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Морковь', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Лук репчатый', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Чеснок', category: 'Овощи и фрукты', unit: 'Шт' },
  { name: 'Помидоры', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Огурцы', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Перец болгарский', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Капуста белокочанная', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Шампиньоны', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Вешенки', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Перец чили', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Имбирь корень', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Укроп', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Петрушка', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Яблоки', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Бананы', category: 'Овощи и фрукты', unit: 'Кг' },
  { name: 'Лимоны', category: 'Овощи и фрукты', unit: 'Шт' },

  // Молочные продукты
  { name: 'Молоко', category: 'Молочные продукты', unit: 'Л' },
  { name: 'Сливочное масло', category: 'Молочные продукты', unit: 'Кг' },
  { name: 'Сыр твердый', category: 'Молочные продукты', unit: 'Кг' },
  { name: 'Сыр плавленый ломтиками', category: 'Молочные продукты', unit: 'Шт' },
  { name: 'Творог', category: 'Молочные продукты', unit: 'Кг' },
  { name: 'Сметана', category: 'Молочные продукты', unit: 'Кг' },
  { name: 'Кефир', category: 'Молочные продукты', unit: 'Л' },

  // Мясо, птица, рыба
  { name: 'Куриное филе', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Куриное бедро', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Фарш куриный', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Фарш говяжий', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Фарш свиной', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Свинина мякоть', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Говядина мякоть', category: 'Мясо, птица, рыба', unit: 'Кг' },
  { name: 'Яйцо куриное', category: 'Мясо, птица, рыба', unit: 'Шт' },
  { name: 'Тунец консервированный', category: 'Мясо, птица, рыба', unit: 'Шт' },

  // Бакалея и хлеб
  { name: 'Хлеб черный', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Батон', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Хлеб зерновой', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Лепешки пшеничные', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Лаваш', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Рис', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Гречка', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Макароны', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Овсяные хлопья', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Мука пшеничная', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Сахар', category: 'Бакалея и хлеб', unit: 'Кг' },
  { name: 'Соль', category: 'Бакалея и хлеб', unit: 'Г' },
  { name: 'Масло подсолнечное', category: 'Бакалея и хлеб', unit: 'Л' },
  { name: 'Масло оливковое', category: 'Бакалея и хлеб', unit: 'Л' },
  { name: 'Масло кунжутное', category: 'Бакалея и хлеб', unit: 'Л' },
  { name: 'Уксус столовый', category: 'Бакалея и хлеб', unit: 'Л' },
  { name: 'Уксус рисовый', category: 'Бакалея и хлеб', unit: 'Л' },
  { name: 'Горошек консервированный', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Кукуруза консервированная', category: 'Бакалея и хлеб', unit: 'Шт' },
  { name: 'Фасоль консервированная', category: 'Бакалея и хлеб', unit: 'Шт' },

  // Заморозка
  { name: 'Овощная смесь замороженная', category: 'Заморозка', unit: 'Кг' },
  { name: 'Пельмени', category: 'Заморозка', unit: 'Кг' },

  // Напитки
  { name: 'Чай', category: 'Напитки', unit: 'Упак' },
  { name: 'Кофе', category: 'Напитки', unit: 'Упак' },

  // Соусы
  { name: 'Соевый соус', category: 'Соусы', unit: 'Л' },
  { name: 'Соус свит чили', category: 'Соусы', unit: 'Л' },
  { name: 'Соус унаги', category: 'Соусы', unit: 'Л' },
  { name: 'Соус терияки', category: 'Соусы', unit: 'Л' },
  { name: 'Майонез', category: 'Соусы', unit: 'Кг' },
  { name: 'Томатная паста', category: 'Соусы', unit: 'Кг' },
  { name: 'Горчица', category: 'Соусы', unit: 'Г' },

  // Разное
  { name: 'Грецкий орех', category: 'Разное', unit: 'Кг' },
  { name: 'Изюм', category: 'Разное', unit: 'Кг' },
  { name: 'Перец черный молотый', category: 'Разное', unit: 'Г' },
  { name: 'Кунжут семена', category: 'Разное', unit: 'Г' },
  { name: 'Сода пищевая', category: 'Разное', unit: 'Г' },
  { name: 'Дрожжи сухие', category: 'Разное', unit: 'Упак' },
  { name: 'Какао-порошок', category: 'Разное', unit: 'Кг' },
  { name: 'Сахарная пудра', category: 'Разное', unit: 'Кг' }
].map((tpl, i) => ({ ...tpl, sort_order: i + 1 }));

for (const tpl of templates) {
  const created = await pb.collection('product_templates').create(tpl);
  console.log('created:', created.sort_order, created.name);
}

console.log(`DONE — ${templates.length} templates`);
