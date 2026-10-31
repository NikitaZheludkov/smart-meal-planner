# Запись пересчитанного КБЖУ (на порцию) в блюда семьи nrauz88c7t9550m.
# Вход — JSON {название блюда: [ккал, Б, Ж, У]} из scripts/recalc-kbju.mjs --json.
#   sudo -u pocketbase python3 apply-kbju.py kbju.json
# Перед изменениями делает копию базы data.db.bak-before-kbju-v2.
# Если какое-то блюдо из JSON не найдено — ничего не меняет.
import json, os, sqlite3, sys
from datetime import datetime, timezone

DB = os.environ.get('DB', '/opt/pocketbase/pb_data/data.db')
H = 'nrauz88c7t9550m'

values = json.load(open(sys.argv[1], encoding='utf-8'))
c = sqlite3.connect(DB)
now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.') + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
dishes = {n: (i, (k, p, f, cb)) for i, n, k, p, f, cb in c.execute(
    'select id, trim(name), kcal, protein, fat, carbs from dishes where household=?', (H,))}

missing = sorted(set(values) - set(dishes))
if missing:
    print('НЕ НАЙДЕНО, ничего не меняю:', ', '.join(missing))
    sys.exit(1)

b = sqlite3.connect(DB + '.bak-before-kbju-v2'); c.backup(b); b.close()
changed = 0
with c:
    for name, (k, p, f, cb) in values.items():
        did, old = dishes[name]
        if tuple(old) == (k, p, f, cb):
            continue
        c.execute('update dishes set kcal=?, protein=?, fat=?, carbs=?, updated=? where id=?', (k, p, f, cb, now, did))
        changed += 1
print(f'Обновлено блюд: {changed} из {len(values)}')
not_in_json = sorted(set(dishes) - set(values))
if not_in_json:
    print('Не пересчитаны (нет в JSON):', ', '.join(not_in_json))
