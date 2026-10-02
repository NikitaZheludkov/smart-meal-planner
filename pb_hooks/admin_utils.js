// Общие хелперы админки. Подключаются через require() ВНУТРИ каждого
// обработчика — PocketBase выполняет колбэки изолированно, top-level функции
// из *.pb.js в них не видны (см. комментарий в main.pb.js).

// Настройки приложения и их значения по умолчанию (если записи ещё нет).
const SETTINGS_DEFAULTS = {
  registration_open: true,
  voice_input_enabled: true,
  announcement: { enabled: false, text: '' }
}

const UNITS = ['Кг', 'Г', 'Л', 'Мл', 'Шт', 'Упак']

// Справочники, которые админ может править, и разрешённые поля.
const DICTS = {
  meal_types: ['name', 'sort_order'],
  dish_types: ['name', 'sort_order'],
  dish_tags: ['name', 'sort_order'],
  product_templates: ['name', 'sort_order', 'category', 'unit']
}

function isAdmin(auth) {
  if (!auth || auth.collection().name !== 'users') return false
  try {
    $app.findFirstRecordByFilter('app_admins', 'user = {:u}', { u: auth.id })
    return true
  } catch (_) {
    return false
  }
}

function requireAdmin(e) {
  if (!e.auth) throw new UnauthorizedError('Нужно войти в аккаунт')
  if (!isAdmin(e.auth)) throw new ForbiddenError('Доступно только администратору')
}

function getSetting(key) {
  const fallback = SETTINGS_DEFAULTS[key]
  try {
    const record = $app.findFirstRecordByData('app_settings', 'key', key)
    const raw = record.getString('value')
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

function validateSetting(key, value) {
  if (!(key in SETTINGS_DEFAULTS)) throw new BadRequestError('Неизвестная настройка')
  if (key === 'announcement') {
    const text = String(value?.text ?? '').trim()
    if (text.length > 500) throw new BadRequestError('Текст объявления — не длиннее 500 символов')
    return { enabled: !!value?.enabled && text.length > 0, text }
  }
  return !!value
}

function setSetting(key, value) {
  const clean = validateSetting(key, value)
  let record
  try {
    record = $app.findFirstRecordByData('app_settings', 'key', key)
  } catch (_) {
    record = new Record($app.findCollectionByNameOrId('app_settings'))
    record.set('key', key)
  }
  record.set('value', clean)
  $app.save(record)
  return clean
}

// Одно число из SQL: запрос должен возвращать колонку "c".
function count(sql, params) {
  const row = new DynamicModel({ c: 0 })
  $app.db().newQuery(sql).bind(params || {}).one(row)
  return row.c
}

function rows(sql, shape, params) {
  const result = arrayOf(new DynamicModel(shape))
  $app.db().newQuery(sql).bind(params || {}).all(result)
  // DynamicModel -> обычные объекты, чтобы e.json() сериализовал их предсказуемо
  return JSON.parse(JSON.stringify(result))
}

// Сколько записей ссылается на элемент справочника (удалять можно только неиспользуемые).
function dictUsage(collection, id) {
  const jsonHas = (column) =>
    `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(${column}) THEN ${column} ELSE '[]' END) WHERE value = {:id})`
  if (collection === 'meal_types') {
    return count(`SELECT COUNT(*) AS c FROM dishes WHERE ${jsonHas('meal_type')}`, { id }) +
      count('SELECT COUNT(*) AS c FROM plan WHERE meal_type = {:id}', { id })
  }
  if (collection === 'dish_types') {
    return count('SELECT COUNT(*) AS c FROM dishes WHERE dish_type = {:id}', { id })
  }
  if (collection === 'dish_tags') {
    return count(`SELECT COUNT(*) AS c FROM dishes WHERE ${jsonHas('tags')}`, { id })
  }
  return 0
}

function cleanDictPayload(collection, body, isCreate) {
  const allowed = DICTS[collection]
  if (!allowed) throw new BadRequestError('Неизвестный справочник')
  const out = {}
  if ('name' in body || isCreate) {
    const name = String(body.name ?? '').trim()
    if (!name) throw new BadRequestError('Название не может быть пустым')
    if (name.length > 60) throw new BadRequestError('Название — не длиннее 60 символов')
    out.name = name
  }
  if ('sort_order' in body) {
    const order = Number(body.sort_order)
    if (!Number.isFinite(order)) throw new BadRequestError('Некорректный порядок')
    out.sort_order = order
  }
  if (allowed.includes('category') && ('category' in body || isCreate)) {
    const category = String(body.category ?? '').trim()
    if (!category || category.length > 60) throw new BadRequestError('Укажите категорию')
    out.category = category
  }
  if (allowed.includes('unit') && ('unit' in body || isCreate)) {
    const unit = String(body.unit ?? '')
    if (!UNITS.includes(unit)) throw new BadRequestError('Некорректная единица измерения')
    out.unit = unit
  }
  return out
}

module.exports = {
  SETTINGS_DEFAULTS,
  DICTS,
  isAdmin,
  requireAdmin,
  getSetting,
  setSetting,
  count,
  rows,
  dictUsage,
  cleanDictPayload
}
