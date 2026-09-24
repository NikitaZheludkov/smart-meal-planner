# Разовая правка данных одного аккаунта: виды блюд + единицы продуктов.
# Запуск на сервере: sudo -u pocketbase python3 rework-user-data.py [--apply]
import sqlite3, sys, math
APPLY = '--apply' in sys.argv
H = 'nrauz88c7t9550m'
c = sqlite3.connect('/opt/pocketbase/pb_data/data.db')
c.execute('pragma busy_timeout=10000')

# --- виды блюд ---
dt = {n: i for n, i in c.execute('select name,id from dish_types')}
DISH_TYPES = {
 'Английский завтрак':'Горячее','Бедро куриное (лук)':'Горячее','Глазунья':'Горячее','Драники':'Горячее',
 'Закрытый бургер':'Горячее','Капуста квашеная':'Закуска','Капуста тушеная':'Гарнир','Карбонара':'Горячее',
 'Кесадилья с курицей':'Горячее','Кесадилья с фасолью':'Горячее','Котлеты из индейки':'Горячее',
 'Крабовые котлеты':'Горячее','Лазанья':'Горячее','Лобио':'Горячее','Люля кебаб':'Горячее',
 'Мидии том-ям':'Горячее','Овощной салат':'Салат','Овсянка с томатами':'Горячее','Овсяноблин':'Горячее',
 'Печеночные оладьи':'Горячее','Печень в сливках':'Горячее','Плов с булгуром':'Горячее','Салат чукка':'Салат',
 'Скрембл':'Горячее','Тост с тунцом':'Закуска','Утренний ролл':'Горячее','Шакшука':'Горячее','Шаурма':'Горячее',
}
ops = []
for did, name, cur in c.execute('select id,name,dish_type from dishes where household=?', (H,)).fetchall():
    new = DISH_TYPES.get(name.strip())
    if not new: print('!! нет вида для', name); continue
    if dt[new] != cur:
        ops.append(('update dishes set dish_type=? where id=?', (dt[new], did)))
        print(f'вид: {name.strip():28} -> {new}')

# --- единицы ---
G = 'Г'; KG_TO_G = 1000
PIECE_KG = {'Помидоры':.12,'Огурцы':.12,'Перец болгарский':.15,'Лук репчатый':.1,'Лук красный':.1,
            'Морковь':.1,'Картофель':.12,'Яблоки':.15,'Перец чили':.02}
TO_G = ['Булгур','Мука пшеничная','Овсяные хлопья','Фасоль сухая','Макароны','Рис','Гречка','Сливочное масло',
 'Сметана','Сыр твердый','Сыр фета','Творог','Бекон','Сосиски или ветчина','Говядина мякоть','Свинина мякоть',
 'Пельмени','Фарш говяжий','Фарш куриный','Фарш мясной','Фарш свиной','Куриное бедро','Куриное филе',
 'Филе индейки','Печень куриная','Мидии','Майонез','Кетчуп','Паста том-ям','Томатная паста','Грецкий орех',
 'Изюм','Какао-порошок','Сахар','Сахарная пудра','Горошек замороженный','Овощная смесь замороженная',
 'Корнишоны','Морковь по-корейски','Укроп','Петрушка','Лук зеленый','Имбирь корень','Вешенки','Шампиньоны',
 'Капуста квашеная']
def q25(x): return max(0.25, round(x*4)/4)
def clean(x): return float(f'{x:.4f}'.rstrip('0').rstrip('.')) if x != int(x) else int(x)

plan = {}  # product name -> (new_unit, fn)
for n in TO_G: plan[n] = ('Г', lambda a: a*1000)
for n, w in PIECE_KG.items(): plan[n] = ('Шт', (lambda w: lambda a: q25(a/w))(w))
prods = {r[1].strip(): r for r in c.execute('select id,name,unit from products where household=?', (H,))}
for r in list(prods.values()):
    if r[2] == 'Л': plan.setdefault(r[1].strip(), ('Мл', lambda a: a*1000))

for name, (unit, fn) in plan.items():
    if name not in prods: print('!! нет продукта', name); continue
    pid, _, old = prods[name]
    if old == unit: continue
    ops.append(('update products set unit=? where id=?', (unit, pid)))
    rows = c.execute('select i.id,i.amount,d.name from ingredients i join dishes d on d.id=i.dish where i.product=? and i.household=?', (pid, H)).fetchall()
    desc = ', '.join(f'{a}→{clean(fn(a))}' for _, a, _ in rows)
    print(f'ед.: {name:28} {old}→{unit}   {desc}')
    for iid, a, _ in rows: ops.append(('update ingredients set amount=? where id=?', (clean(fn(a)), iid)))

# кинза: ошибочные 0.05/0.02 "Г" (на деле граммы ×1000 потеряны)
kin = prods['Кинза'][0]
for iid, a, dn in c.execute('select i.id,i.amount,d.name from ingredients i join dishes d on d.id=i.dish where i.product=? and i.amount<1', (kin,)).fetchall():
    print(f'кинза: {dn} {a} Г → {clean(a*1000)} Г')
    ops.append(('update ingredients set amount=? where id=?', (clean(a*1000), iid)))

print(len(ops), 'операций', '(APPLY)' if APPLY else '(dry-run)')
if APPLY:
    b = sqlite3.connect('/opt/pocketbase/pb_data/data.db.bak-before-rework'); c.backup(b); b.close()
    with c:
        for sql, p in ops: c.execute(sql, p)
    print('applied')
