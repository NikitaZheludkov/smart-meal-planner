# Добавление новых блюд в базу семьи nrauz88c7t9550m (подборка от 13.10.2026).
# Составы — на весь рецепт, КБЖУ — на порцию (посчитано по той же таблице,
# что recalc-kbju.py, с маслом для жарки, которое подразумевается).
# Запуск на сервере:
#   sudo -u pocketbase python3 add-user-dishes.py
# Перед изменениями делает копию базы data.db.bak-before-new-dishes.
# Блюда, которые уже есть (по названию), пропускает; если не найден продукт —
# ничего не меняет.
import json, os, random, sqlite3, string, sys
from datetime import datetime, timezone

DB = os.environ.get('DB', '/opt/pocketbase/pb_data/data.db')
H = 'nrauz88c7t9550m'

# Новые продукты: (название, единица, категория)
NEW_PRODUCTS = [
    ('Салат листовой', 'Г', 'Овощи и фрукты'),
]

LUNCH_DINNER = ['Обед', 'Ужин']
SALAD_MEALS = ['Обед', 'Ужин', 'Перекус']

# (название, вид, приёмы пищи, порций, (ккал, Б, Ж, У), теги, с гарниром, состав)
DISHES = [
    ('Кукурузные лепёшки с тунцом', 'Горячее', ['Завтрак'], 2, (448, 32, 20, 33), ['Быстро'], False, [
        ('Кукуруза консервированная', 1), ('Яйцо куриное', 2), ('Мука пшеничная', 60), ('Сыр твердый', 40),
        ('Лук зеленый', 10), ('Тунец консервированный', 1), ('Салат листовой', 40)]),
    ('Гречка по-купечески с грибами', 'Горячее', LUNCH_DINNER, 4, (538, 29, 28, 45), [], False, [
        ('Свинина мякоть', 400), ('Гречка', 250), ('Шампиньоны', 300), ('Лук репчатый', 1), ('Морковь', 1),
        ('Томатная паста', 30), ('Чеснок', 2)]),
    ('Паста с песто и курицей', 'Горячее', LUNCH_DINNER, 2, (867, 43, 42, 76), ['Быстро'], False, [
        ('Макароны', 200), ('Куриное бедро', 300), ('Песто', 60), ('Помидоры черри', 150), ('Сыр твердый', 30)]),
    ('Курица в сливочно-грибном соусе', 'Горячее', LUNCH_DINNER, 2, (609, 42, 42, 18), [], True, [
        ('Куриное бедро', 400), ('Вешенки', 250), ('Сливки 10%', 200), ('Лук репчатый', 1), ('Чеснок', 2)]),
    ('Салат с тунцом и яйцом', 'Салат', SALAD_MEALS, 2, (327, 26, 20, 8), ['Быстро'], False, [
        ('Тунец консервированный', 1), ('Яйцо куриное', 3), ('Огурцы', 1), ('Кукуруза консервированная', 0.5),
        ('Майонез', 30), ('Лук зеленый', 10)]),
    ('Крабовый салат', 'Салат', SALAD_MEALS, 2, (460, 16, 25, 41), [], False, [
        ('Крабовые палочки', 1), ('Кукуруза консервированная', 0.5), ('Яйцо куриное', 2), ('Рис', 50),
        ('Огурцы', 1), ('Майонез', 50)]),
    ('Битые огурцы', 'Салат', SALAD_MEALS, 2, (166, 5, 10, 14), ['Быстро'], False, [
        ('Огурцы', 3), ('Соевый соус', 45), ('Уксус рисовый', 30), ('Масло кунжутное', 15), ('Сахар', 5),
        ('Чеснок', 3), ('Паприка острая', 5), ('Кунжут семена', 10), ('Соль', 3)]),
    ('Витаминный салат', 'Салат', SALAD_MEALS, 2, (146, 4, 7, 16), ['Быстро'], False, [
        ('Капуста белокочанная', 0.4), ('Морковь', 1), ('Уксус столовый', 10), ('Масло подсолнечное', 15),
        ('Сахар', 5), ('Укроп', 10)]),
    ('Капуста по-корейски', 'Салат', SALAD_MEALS, 4, (171, 4, 10, 18), [], False, [
        ('Капуста белокочанная', 0.6), ('Морковь', 1), ('Перец болгарский', 1), ('Чеснок', 3),
        ('Уксус столовый', 30), ('Масло подсолнечное', 40), ('Сахар', 20), ('Кориандр', 3), ('Перец чили', 0.5)]),
    ('Картофель по-деревенски', 'Гарнир', LUNCH_DINNER, 2, (323, 6, 10, 50), [], False, [
        ('Картофель', 4), ('Масло подсолнечное', 20), ('Чеснок', 2), ('Укроп', 10)]),
    ('Гречка с грибами и луком', 'Гарнир', LUNCH_DINNER, 2, (380, 14, 14, 51), [], False, [
        ('Гречка', 150), ('Шампиньоны', 200), ('Лук репчатый', 1), ('Сливочное масло', 15)]),
    ('Запечённые овощи', 'Гарнир', LUNCH_DINNER, 2, (199, 5, 10, 22), [], False, [
        ('Овощная смесь замороженная', 400), ('Перец болгарский', 1), ('Масло оливковое', 20), ('Чеснок', 2)]),
    ('Самса с курицей', 'Прочее', SALAD_MEALS, 2, (715, 28, 45, 50), ['Выходного дня'], False, [
        ('Тесто слоеное', 1), ('Куриное бедро', 200), ('Лук репчатый', 1), ('Зира', 2), ('Яйцо куриное', 0.5),
        ('Кунжут семена', 5)]),
]

c = sqlite3.connect(DB)
now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.') + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
new_id = lambda: ''.join(random.choices(string.ascii_lowercase + string.digits, k=15))

meal = {n: i for i, n in c.execute('select id, name from meal_types')}
meal_order = [r[0] for r in c.execute('select id from meal_types order by sort_order')]
dtype = {n: i for i, n in c.execute('select id, name from dish_types')}
tag = {n: i for i, n in c.execute('select id, name from dish_tags')}
products = {n: i for n, i in c.execute('select trim(name), id from products where household=?', (H,))}
existing = {r[0] for r in c.execute('select trim(name) from dishes where household=?', (H,))}

# Проверка до изменений: все продукты, виды, приёмы и теги должны найтись
known = set(products) | {p[0] for p in NEW_PRODUCTS}
missing = sorted({p for d in DISHES for p, _ in d[7] if p not in known})
missing += [f'вид «{d[1]}»' for d in DISHES if d[1] not in dtype]
missing += [f'приём «{m}»' for d in DISHES for m in d[2] if m not in meal]
missing += [f'тег «{t}»' for d in DISHES for t in d[5] if t not in tag]
if missing:
    print('НЕ НАЙДЕНО, ничего не меняю:', ', '.join(missing))
    sys.exit(1)

b = sqlite3.connect(DB + '.bak-before-new-dishes'); c.backup(b); b.close()

log = []
with c:
    for name, unit, category in NEW_PRODUCTS:
        if name in products:
            continue
        pid = new_id()
        c.execute('insert into products (id, household, name, unit, category, created, updated) values (?,?,?,?,?,?,?)',
                  (pid, H, name, unit, category, now, now))
        products[name] = pid
        log.append(f'Продукт: {name}')

    for name, type_name, meals, portions, (kcal, p, f, carbs), tags, side, ings in DISHES:
        if name in existing:
            log.append(f'Пропущено (уже есть): {name}')
            continue
        did = new_id()
        meal_ids = [m for m in meal_order if m in {meal[x] for x in meals}]
        c.execute('''insert into dishes (id, household, name, dish_type, meal_type, batch_yield, is_batch, kcal, protein, fat, carbs,
                     description, image_url, tags, needs_side_dish, created, updated)
                     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                  (did, H, name, dtype[type_name], json.dumps(meal_ids), portions, 0, kcal, p, f, carbs, '', '',
                   json.dumps([tag[t] for t in tags]), 1 if side else 0, now, now))
        for prod, amount in ings:
            c.execute('insert into ingredients (id, household, dish, product, amount, created, updated) values (?,?,?,?,?,?,?)',
                      (new_id(), H, did, products[prod], amount, now, now))
        log.append(f'Блюдо: {name} ({len(ings)} ингр.)')

print('\n'.join(log))
