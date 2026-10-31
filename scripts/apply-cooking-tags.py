# Способы готовки и теги «С собой» / «Много порций» для блюд семьи
# nrauz88c7t9550m (согласовано 13.10.2026). Запускать после миграции
# 1789990000_dish_tags_rework.js — она создаёт новые теги.
#   sudo -u pocketbase python3 apply-cooking-tags.py
# Перед изменениями делает копию базы data.db.bak-before-cooking-tags.
# Если какое-то блюдо или тег не найдены — ничего не меняет.
import json, os, sqlite3, sys
from datetime import datetime, timezone

DB = os.environ.get('DB', '/opt/pocketbase/pb_data/data.db')
H = 'nrauz88c7t9550m'

METHODS = {
    'fry': [
        'Английский завтрак', 'Бедро куриное (лук)', 'Блины тонкие', 'Глазунья', 'Гречка по-купечески с грибами',
        'Драники', 'Капуста тушеная', 'Кесадилья с курицей', 'Кесадилья с фасолью', 'Котлеты из индейки',
        'Кукурузные лепёшки с тунцом', 'Курица в сливочно-грибном соусе', 'Овсянка с томатами', 'Овсяноблин',
        'Омлет-рулет с сыром', 'Паста с креветками и страчателлой', 'Паста с песто и курицей', 'Печеночные оладьи',
        'Печень в сливках', 'Плов с булгуром', 'Рагу со свининой', 'Ротти с ветчиной', 'Скрембл', 'Сырники',
        'Сырники соленые', 'Утренний ролл', 'Филе минтая в панировке', 'Шакшука', 'Шаурма',
        'Гречка с грибами и луком'],
    'bake': [
        'Закрытый бургер', 'Камамбер запеченный в тесте с беконом', 'Камамбер запеченый с томатами',
        'Крабовые котлеты', 'Лазанья', 'Ленивые пирожки', 'Люля кебаб', 'Пирог с курицей', 'Пицца Пепперони',
        'Рулетики из лаваша с ветчиной', 'Рулетики из лаваша с крабовыми палочками', 'Запечённые овощи',
        'Картофель по-деревенски', 'Самса с курицей'],
    'boil': [
        'Карбонара', 'Мидии том-ям', 'Булгур отварной', 'Гречка отварная', 'Картофельное пюре', 'Лобио',
        'Макароны отварные', 'Рис отварной'],
    'raw': [
        'Тост с тунцом', 'Битые огурцы', 'Витаминный салат', 'Капуста квашеная', 'Капуста по-корейски',
        'Крабовый салат', 'Морковь по-корейски', 'Овощной салат', 'Салат из моркови с апельсиновой заправкой',
        'Салат из свеклы с селедкой', 'Салат с тунцом и яйцом', 'Салат чукка', 'Суши-салат'],
}

TAKEAWAY = [
    'Бедро куриное (лук)', 'Гречка по-купечески с грибами', 'Капуста тушеная', 'Котлеты из индейки',
    'Крабовые котлеты', 'Курица в сливочно-грибном соусе', 'Лазанья', 'Люля кебаб', 'Паста с песто и курицей',
    'Печеночные оладьи', 'Печень в сливках', 'Плов с булгуром', 'Рагу со свининой', 'Самса с курицей']

# Смена вида блюда
DISH_TYPE = {'Самса с курицей': 'Горячее'}

c = sqlite3.connect(DB)
now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.') + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"

dishes = {n: (i, json.loads(t or '[]'), y) for i, n, t, y in c.execute(
    'select id, trim(name), tags, batch_yield from dishes where household=?', (H,))}
tag = {n: i for i, n in c.execute('select id, name from dish_tags')}
dtype = {n: i for i, n in c.execute('select id, name from dish_types')}

named = [n for names in METHODS.values() for n in names] + TAKEAWAY + list(DISH_TYPE)
missing = sorted({n for n in named if n not in dishes})
missing += [f'тег «{t}»' for t in ('С собой', 'Много порций') if t not in tag]
missing += [f'вид «{t}»' for t in DISH_TYPE.values() if t not in dtype]
unassigned = sorted(set(dishes) - {n for names in METHODS.values() for n in names})
if missing:
    print('НЕ НАЙДЕНО, ничего не меняю:', ', '.join(missing))
    sys.exit(1)

b = sqlite3.connect(DB + '.bak-before-cooking-tags'); c.backup(b); b.close()

counts = {m: 0 for m in METHODS}
takeaway = many = 0
with c:
    for method, names in METHODS.items():
        for n in names:
            c.execute('update dishes set cooking_method=?, updated=? where id=?', (method, now, dishes[n][0]))
            counts[method] += 1
    for n, (did, tags, y) in dishes.items():
        new_tags = list(tags)
        if n in TAKEAWAY and tag['С собой'] not in new_tags:
            new_tags.append(tag['С собой']); takeaway += 1
        if (y or 1) > 2 and tag['Много порций'] not in new_tags:
            new_tags.append(tag['Много порций']); many += 1
        if new_tags != tags:
            c.execute('update dishes set tags=?, updated=? where id=?', (json.dumps(new_tags), now, did))
    for n, t in DISH_TYPE.items():
        c.execute('update dishes set dish_type=?, updated=? where id=?', (dtype[t], now, dishes[n][0]))

print('Способы готовки:', counts)
print('«С собой» добавлен:', takeaway, '· «Много порций» добавлен:', many)
print('Вид блюда изменён:', ', '.join(f'{n} → {t}' for n, t in DISH_TYPE.items()))
if unassigned:
    print('Без способа готовки (новые блюда?):', ', '.join(unassigned))
