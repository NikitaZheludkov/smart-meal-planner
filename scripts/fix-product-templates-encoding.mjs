import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASS);

// Предыдущие записи были испорчены кодировкой при вставке через bash-heredoc
// на Windows (не UTF-8-safe). Удаляем битые и создаём заново — на этот раз
// строки живут прямо в .mjs файле (записан инструментом с гарантированным
// UTF-8), без прохода через shell-интерполяцию.
const broken = await pb.collection('product_templates').getFullList();
for (const item of broken) {
  await pb.collection('product_templates').delete(item.id);
}
console.log(`removed ${broken.length} broken templates`);

const templates = [
  { name: 'Куриная грудка', category: 'Мясо, птица, рыба', unit: 'Кг', sort_order: 1 },
  { name: 'Рис', category: 'Бакалея и хлеб', unit: 'Кг', sort_order: 2 },
  { name: 'Молоко', category: 'Молочные продукты', unit: 'Л', sort_order: 3 },
  { name: 'Яйца', category: 'Молочные продукты', unit: 'Шт', sort_order: 4 },
  { name: 'Лук репчатый', category: 'Овощи и фрукты', unit: 'Кг', sort_order: 5 }
];

for (const tpl of templates) {
  const created = await pb.collection('product_templates').create(tpl);
  console.log('created:', created.name);
}

console.log('DONE');
