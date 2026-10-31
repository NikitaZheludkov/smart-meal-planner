# Выгрузка блюд семьи nrauz88c7t9550m для пересчёта КБЖУ (scripts/recalc-kbju.mjs).
#   ssh ... 'python3 -' < scripts/dump-dishes.py > dishes.json
import sqlite3, json
c = sqlite3.connect('/opt/pocketbase/pb_data/data.db')
H = 'nrauz88c7t9550m'
dt = {i: n for i, n in c.execute('select id, name from dish_types')}
out = []
for did, n, d, cm, y, k, p, f, cb in c.execute(
        'select id, trim(name), dish_type, cooking_method, batch_yield, kcal, protein, fat, carbs from dishes where household=? order by name', (H,)):
    ings = [(pn, a, u) for pn, a, u in c.execute(
        'select trim(p.name), i.amount, p.unit from ingredients i join products p on p.id=i.product where i.dish=?', (did,))]
    out.append({'name': n, 'type': dt.get(d), 'method': cm, 'yield': y, 'kbju': [k, p, f, cb], 'ings': ings})
used = sorted({i[0] + '|' + i[2] for d in out for i in d['ings']})
print(json.dumps({'dishes': out, 'products': used}, ensure_ascii=False))
