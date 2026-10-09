# Разовое исправление блюд семьи nrauz88c7t9550m по итогам проверки составов
# (единицы, дубли, приёмы пищи, гарниры). Запуск на сервере:
#   sudo -u pocketbase python3 fix-user-dishes.py
# Перед изменениями делает копию базы data.db.bak-before-dish-fixes.
import json, os, random, sqlite3, string
from datetime import datetime, timezone

DB = os.environ.get('DB', '/opt/pocketbase/pb_data/data.db')
H = 'nrauz88c7t9550m'

c = sqlite3.connect(DB)
b = sqlite3.connect(DB + '.bak-before-dish-fixes'); c.backup(b); b.close()

now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.') + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
new_id = lambda: ''.join(random.choices(string.ascii_lowercase + string.digits, k=15))
one = lambda sql, *a: c.execute(sql, a).fetchone()

meal = {n: i for i, n in c.execute('select id, name from meal_types')}
dtype = {n: i for i, n in c.execute('select id, name from dish_types')}
meal_order = [r[0] for r in c.execute('select id from meal_types order by sort_order')]
dish_id = lambda name: one('select id from dishes where household=? and trim(name)=? order by created limit 1', H, name)[0]
prod_id = lambda name: one('select id from products where household=? and trim(name)=?', H, name)[0]
log = []

def set_amount(dish, product, amount):
    n = c.execute('update ingredients set amount=?, updated=? where dish=? and product=?', (amount, now, dish_id(dish), prod_id(product))).rowcount
    log.append(f'{dish}: {product} -> {amount} ({n})')

def add_meal(dish_row_id, name):
    mt = json.loads(one('select meal_type from dishes where id=?', dish_row_id)[0] or '[]')
    if meal[name] not in mt:
        mt = [m for m in meal_order if m in mt + [meal[name]]]
        c.execute('update dishes set meal_type=?, updated=? where id=?', (json.dumps(mt), now, dish_row_id))
        return True
    return False

with c:
    # --- 1. Количества ---
    set_amount('Драники', 'Сметана', 100)
    set_amount('Драники', 'Лук репчатый', 1)
    set_amount('Котлеты из индейки', 'Укроп', 20)
    set_amount('Лазанья', 'Сливочное масло', 50)
    set_amount('Лазанья', 'Мука пшеничная', 50)
    set_amount('Лазанья', 'Молоко', 500)

    # КБЖУ на порцию для блюд, где состав заметно поменялся
    c.execute("update dishes set kcal=332, protein=8, fat=9, carbs=55, updated=? where id=?", (now, dish_id('Драники')))
    # Лазанья: −50 г масла, −50 г муки, +200 мл молока на 4 порции ≈ −109 ккал, −9 г жиров, −6 г углеводов на порцию
    c.execute("update dishes set kcal=kcal-109, fat=max(fat-9,0), carbs=max(carbs-6,0), updated=? where id=?", (now, dish_id('Лазанья')))
    # Закрытый бургер (на 2 порции): фарш 450 г, слоёное тесто 1 шт ≈ 250 г, сыры, соусы, овощи
    c.execute("update dishes set kcal=1199, protein=53, fat=87, carbs=51, updated=? where id=?", (now, dish_id('Закрытый бургер')))
    log.append('КБЖУ: Драники, Лазанья, Закрытый бургер')

    # --- 2. Дубль «Капуста квашеная» (Горячее) — план переносим на салат, дубль удаляем ---
    dup = one("select id from dishes where household=? and name='Капуста квашеная '", H)
    keep = one("select id from dishes where household=? and name='Капуста квашеная'", H)
    if dup and keep:
        moved = c.execute('update plan set dish=?, updated=? where dish=?', (keep[0], now, dup[0])).rowcount
        c.execute('delete from ingredients where dish=?', (dup[0],))
        c.execute('delete from dishes where id=?', (dup[0],))
        log.append(f'Удалён дубль капусты, записей плана перенесено: {moved}')

    # --- 3. Капуста тушеная — это горячее, а не гарнир ---
    c.execute('update dishes set dish_type=?, updated=? where id=?', (dtype['Горячее'], now, dish_id('Капуста тушеная')))

    # --- 4. Объединяем «Масло сливочное» в «Сливочное масло» ---
    old, keep_b = prod_id('Масло сливочное'), prod_id('Сливочное масло')
    for t in ('ingredients', 'plan', 'shopping_cart'):
        c.execute(f'update {t} set product=?, updated=? where product=?', (keep_b, now, old))
    c.execute('delete from products where id=?', (old,))
    log.append('Масло сливочное -> Сливочное масло')

    # --- 5. Ужин для горячего, отмеченного только на обед; салаты — тоже на ужин ---
    added_dinner = []
    for did, name, dt, mt in c.execute('select id, name, dish_type, meal_type from dishes where household=?', (H,)).fetchall():
        mts = json.loads(mt or '[]')
        if mts == [meal['Обед']] and dt in (dtype['Горячее'], dtype['Салат']):
            if add_meal(did, 'Ужин'): added_dinner.append(name.strip())
    log.append('Добавлен ужин: ' + ', '.join(sorted(added_dinner)))

    # --- 6. Печёночные оладьи подаются с гарниром ---
    c.execute('update dishes set needs_side_dish=1, updated=? where id=?', (now, dish_id('Печеночные оладьи')))

    # --- 7. Гарниры (на 2 порции, КБЖУ на порцию) ---
    garnishes = [
        ('Рис отварной', (258, 5, 1, 59), [('Рис', 150)]),
        ('Гречка отварная', (235, 9, 2, 47), [('Гречка', 150)]),
        ('Макароны отварные', (317, 10, 5, 57), [('Макароны', 160), ('Сливочное масло', 10)]),
        ('Булгур отварной', (257, 9, 1, 57), [('Булгур', 150)]),
        ('Картофельное пюре', (332, 7, 11, 50), [('Картофель', 4), ('Молоко', 100), ('Сливочное масло', 20)]),
    ]
    for name, (kcal, p, f, carbs), ings in garnishes:
        if one('select id from dishes where household=? and name=?', H, name):
            continue
        did = new_id()
        c.execute('''insert into dishes (id, household, name, dish_type, meal_type, batch_yield, is_batch, kcal, protein, fat, carbs,
                     description, image_url, tags, needs_side_dish, created, updated)
                     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                  (did, H, name, dtype['Гарнир'], json.dumps([meal['Обед'], meal['Ужин']]), 2, 0, kcal, p, f, carbs, '', '', '[]', 0, now, now))
        for prod, amount in ings:
            c.execute('insert into ingredients (id, household, dish, product, amount, created, updated) values (?,?,?,?,?,?,?)',
                      (new_id(), H, did, prod_id(prod), amount, now, now))
        log.append(f'Гарнир: {name}')

    # --- 8. Пробелы в конце названий ---
    n1 = c.execute('update dishes set name=trim(name), updated=? where household=? and name!=trim(name)', (now, H)).rowcount
    n2 = c.execute('update products set name=trim(name), updated=? where household=? and name!=trim(name)', (now, H)).rowcount
    log.append(f'Пробелы убраны: блюд {n1}, продуктов {n2}')

    # --- 9. Яйца — к молочным продуктам (отдел в магазине) ---
    c.execute("update products set category='Молочные продукты', updated=? where household=? and name='Яйцо куриное'", (now, H))

print('\n'.join(log))
