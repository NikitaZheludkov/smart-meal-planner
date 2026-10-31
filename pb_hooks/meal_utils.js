// Правила для блюд при сохранении. Обед и ужин — одна категория «Обед/Ужин»: блюда на них почти
// всегда одни и те же. В плане это по-прежнему разные ячейки, поэтому в
// блюде храним оба id. Подключается через require() внутри обработчика.

function pairLunchDinner(app, record) {
  let lunch, dinner
  try {
    lunch = app.findFirstRecordByData('meal_types', 'name', 'Обед').id
    dinner = app.findFirstRecordByData('meal_types', 'name', 'Ужин').id
  } catch (_) {
    return false
  }

  const slice = record.getStringSlice('meal_type') || []
  const ids = []
  for (let i = 0; i < slice.length; i++) ids.push(slice[i])

  const hasLunch = ids.indexOf(lunch) !== -1
  const hasDinner = ids.indexOf(dinner) !== -1
  if (hasLunch === hasDinner) return false

  ids.push(hasLunch ? dinner : lunch)
  record.set('meal_type', ids)
  return true
}

// Рецепт даёт больше 2 порций — ставим тег «Много порций». Только добавляем:
// при 1–2 порциях тег можно поставить и вручную, его не трогаем.
function tagManyPortions(app, record) {
  if ((Number(record.get('batch_yield')) || 1) <= 2) return false
  let tagId
  try {
    tagId = app.findFirstRecordByData('dish_tags', 'name', 'Много порций').id
  } catch (_) {
    return false
  }
  const slice = record.getStringSlice('tags') || []
  const ids = []
  for (let i = 0; i < slice.length; i++) ids.push(slice[i])
  if (ids.indexOf(tagId) !== -1) return false
  ids.push(tagId)
  record.set('tags', ids)
  return true
}

module.exports = { pairLunchDinner, tagManyPortions }
