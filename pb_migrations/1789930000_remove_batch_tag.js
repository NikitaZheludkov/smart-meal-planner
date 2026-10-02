/// <reference path="../pb_data/types.d.ts" />
// Тег «Заготовка» дублирует поле блюда «сколько порций даёт рецепт»
// (batch_yield) — убираем его. Сначала снимаем тег с блюд, если где-то стоит.
migrate((app) => {
  let tag
  try {
    tag = app.findFirstRecordByData('dish_tags', 'name', 'Заготовка')
  } catch (_) {
    return
  }
  const dishes = app.findRecordsByFilter('dishes', 'tags ~ {:id}', '', 0, 0, { id: tag.id })
  for (const dish of dishes) {
    dish.set('tags', (dish.get('tags') || []).filter((id) => id !== tag.id))
    app.save(dish)
  }
  app.delete(tag)
}, (app) => {
  // Необратимо: тег не восстанавливаем
})
