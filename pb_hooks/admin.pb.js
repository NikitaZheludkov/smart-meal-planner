// Эндпоинты панели администратора (/api/admin/*). Каждый обработчик сам
// проверяет, что текущий пользователь есть в коллекции app_admins.
// Хелперы — в admin_utils.js (подключаются require() внутри колбэка, см.
// примечание в main.pb.js про изолированное выполнение колбэков).

// --- Статистика ---
routerAdd('GET', '/api/admin/stats', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const since = (days) => `datetime('now', '-${days} days')`

  const totals = {
    users: u.count('SELECT COUNT(*) AS c FROM users'),
    households: u.count('SELECT COUNT(*) AS c FROM households'),
    dishes: u.count('SELECT COUNT(*) AS c FROM dishes'),
    products: u.count('SELECT COUNT(*) AS c FROM products'),
    ingredients: u.count('SELECT COUNT(*) AS c FROM ingredients'),
    plan: u.count('SELECT COUNT(*) AS c FROM plan'),
    usersNew7: u.count(`SELECT COUNT(*) AS c FROM users WHERE created >= ${since(7)}`),
    usersNew30: u.count(`SELECT COUNT(*) AS c FROM users WHERE created >= ${since(30)}`),
    // Активная семья — что-то меняла в плане, блюдах или списке покупок.
    // Продукты не учитываем: их массово создаёт автозаполнение при регистрации.
    activeHouseholds7: u.count(`
      SELECT COUNT(DISTINCT household) AS c FROM (
        SELECT household, updated FROM plan
        UNION ALL SELECT household, updated FROM dishes
        UNION ALL SELECT household, updated FROM shopping_cart
      ) WHERE updated >= ${since(7)}`),
    planNext7: u.count(`SELECT COUNT(*) AS c FROM plan WHERE date >= date('now') AND date < date('now', '+7 days')`)
  }

  // Даты регистраций за 12 недель — по неделям группирует клиент (в его часовом поясе).
  const signups = u.rows(
    `SELECT created FROM users WHERE created >= ${since(84)} ORDER BY created`,
    { created: '' }
  ).map((r) => r.created)

  const households = u.rows(`
    SELECT
      h.id, h.name, h.created,
      COALESCE((SELECT email FROM users WHERE id = h.owner), '') AS owner_email,
      (SELECT COUNT(*) FROM users WHERE household = h.id) AS members,
      (SELECT COUNT(*) FROM dishes WHERE household = h.id) AS dishes,
      (SELECT COUNT(*) FROM products WHERE household = h.id) AS products,
      (SELECT COUNT(*) FROM plan WHERE household = h.id) AS plan_items,
      MAX(
        COALESCE((SELECT MAX(updated) FROM plan WHERE household = h.id), ''),
        COALESCE((SELECT MAX(updated) FROM dishes WHERE household = h.id), ''),
        COALESCE((SELECT MAX(updated) FROM shopping_cart WHERE household = h.id), '')
      ) AS last_activity
    FROM households h
    ORDER BY last_activity DESC, h.created DESC`,
    { id: '', name: '', created: '', owner_email: '', members: 0, dishes: 0, products: 0, plan_items: 0, last_activity: '' }
  )

  const users = u.rows(`
    SELECT
      u.id, u.email, u.created, COALESCE(u.household, '') AS household,
      CASE WHEN EXISTS (SELECT 1 FROM app_admins a WHERE a.user = u.id) THEN 1 ELSE 0 END AS is_admin
    FROM users u
    ORDER BY u.created DESC`,
    { id: '', email: '', created: '', household: '', is_admin: 0 }
  )

  return e.json(200, { totals, signups, households, users })
})

// --- Справочники ---
routerAdd('GET', '/api/admin/dicts', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const result = {}
  for (const name of Object.keys(u.DICTS)) {
    const fields = u.DICTS[name]
    const records = $app.findRecordsByFilter(name, '', 'sort_order,created', 2000, 0)
    result[name] = records.map((r) => {
      const item = { id: r.id }
      for (const f of fields) item[f] = r.get(f)
      if (name !== 'product_templates') item.usage = u.dictUsage(name, r.id)
      return item
    })
  }
  return e.json(200, result)
})

routerAdd('POST', '/api/admin/dicts/{collection}', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const collection = e.request.pathValue('collection')
  const payload = u.cleanDictPayload(collection, e.requestInfo().body || {}, true)

  if (!('sort_order' in payload)) {
    const last = $app.findRecordsByFilter(collection, '', '-sort_order', 1, 0)
    payload.sort_order = last.length ? (Number(last[0].get('sort_order')) || 0) + 1 : 1
  }

  const record = new Record($app.findCollectionByNameOrId(collection))
  for (const [k, v] of Object.entries(payload)) record.set(k, v)
  $app.save(record)
  return e.json(200, { id: record.id, ...payload })
})

routerAdd('PATCH', '/api/admin/dicts/{collection}/{id}', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const collection = e.request.pathValue('collection')
  const payload = u.cleanDictPayload(collection, e.requestInfo().body || {}, false)
  const record = $app.findRecordById(collection, e.request.pathValue('id'))
  for (const [k, v] of Object.entries(payload)) record.set(k, v)
  $app.save(record)
  return e.json(200, { id: record.id, ...payload })
})

routerAdd('DELETE', '/api/admin/dicts/{collection}/{id}', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const collection = e.request.pathValue('collection')
  if (!u.DICTS[collection]) throw new BadRequestError('Неизвестный справочник')
  const id = e.request.pathValue('id')
  const usage = u.dictUsage(collection, id)
  if (usage > 0) {
    throw new BadRequestError(`Нельзя удалить: используется в ${usage} записях. Можно переименовать.`)
  }
  $app.delete($app.findRecordById(collection, id))
  return e.json(200, { ok: true })
})

// --- Настройки приложения ---
routerAdd('PUT', '/api/admin/settings', (e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  u.requireAdmin(e)

  const body = e.requestInfo().body || {}
  const value = u.setSetting(String(body.key || ''), body.value)
  return e.json(200, { key: body.key, value })
})

// Закрытая регистрация: новые аккаунты не создаются (кроме как суперюзером из /_/).
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/admin_utils.js`)
  if (!e.hasSuperuserAuth() && u.getSetting('registration_open') === false) {
    throw new BadRequestError('Регистрация новых аккаунтов временно закрыта')
  }
  e.next()
}, 'users')
