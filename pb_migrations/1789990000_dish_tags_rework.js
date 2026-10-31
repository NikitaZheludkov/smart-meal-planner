/// <reference path="../pb_data/types.d.ts" />
// Теги для подбора: «С собой» (удобно взять обед на работу) и «Много порций»
// (рецепт даёт больше 2 порций — ставится сам, см. meal_utils.js). Теги
// «Детское», «Праздничное», «Вегетарианское» не пригодились — снимаем их с
// блюд и удаляем.
const ADD = ['С собой', 'Много порций']
const REMOVE = ['Детское', 'Праздничное', 'Вегетарианское']

migrate((app) => {
  const tags = app.findCollectionByNameOrId('dish_tags')
  let order = 0
  for (const t of app.findRecordsByFilter('dish_tags', '', '', 0, 0)) {
    order = Math.max(order, Number(t.get('sort_order')) || 0)
  }
  for (const name of ADD) {
    try {
      app.findFirstRecordByData('dish_tags', 'name', name)
    } catch (_) {
      const rec = new Record(tags)
      rec.set('name', name)
      rec.set('sort_order', ++order)
      app.save(rec)
    }
  }

  for (const name of REMOVE) {
    let tag
    try {
      tag = app.findFirstRecordByData('dish_tags', 'name', name)
    } catch (_) {
      continue
    }
    const dishes = app.findRecordsByFilter('dishes', 'tags ~ {:id}', '', 0, 0, { id: tag.id })
    for (const dish of dishes) {
      const slice = dish.getStringSlice('tags') || []
      const ids = []
      for (let i = 0; i < slice.length; i++) if (slice[i] !== tag.id) ids.push(slice[i])
      dish.set('tags', ids)
      app.saveNoValidate(dish)
    }
    app.delete(tag)
  }
}, (app) => {
  // Необратимо: удалённые теги не восстанавливаем
})
