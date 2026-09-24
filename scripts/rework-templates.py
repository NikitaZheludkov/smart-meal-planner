# Единицы стартовых продуктов (product_templates) — по тем же правилам, что у основного аккаунта.
import sqlite3
c = sqlite3.connect('/opt/pocketbase/pb_data/data.db')
PIECES = ['Картофель','Морковь','Лук репчатый','Помидоры','Огурцы','Перец болгарский','Перец чили','Яблоки','Бананы']
KEEP_KG = ['Капуста белокочанная']
with c:
    for n, u in c.execute('select name,unit from product_templates').fetchall():
        new = 'Шт' if n in PIECES else 'Мл' if u == 'Л' else 'Г' if u == 'Кг' and n not in KEEP_KG else u
        if new != u: c.execute('update product_templates set unit=? where name=?', (new, n))
for r in c.execute("select unit,count(*) from product_templates group by unit"): print(r)
