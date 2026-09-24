/// <reference path="../pb_data/types.d.ts" />
// Виды блюд: Горячее, Салат, Гарнир, Закуска, Прочее (в таком порядке).
// Суп → Горячее; Десерт и Напиток → Прочее. Блюда всех семей переносятся на
// новые виды до удаления старых, чтобы не осталось битых ссылок.
migrate((app) => {
  const find = (name) => {
    try { return app.findFirstRecordByData("dish_types", "name", name) } catch (_) { return null }
  }
  const ensure = (name, order) => {
    let rec = find(name)
    if (!rec) {
      rec = new Record(app.findCollectionByNameOrId("dish_types"))
      rec.set("name", name)
    }
    rec.set("sort_order", order)
    app.save(rec)
    return rec
  }

  const hot = ensure("Горячее", 1)
  ensure("Салат", 2)
  ensure("Гарнир", 3)
  ensure("Закуска", 4)
  const other = ensure("Прочее", 5)

  const remap = { "Суп": hot, "Десерт": other, "Напиток": other }
  for (const oldName of Object.keys(remap)) {
    const old = find(oldName)
    if (!old) continue
    const dishes = app.findRecordsByFilter("dishes", "dish_type = {:t}", "", 0, 0, { t: old.id })
    for (const dish of dishes) {
      dish.set("dish_type", remap[oldName].id)
      app.save(dish)
    }
    app.delete(old)
  }
}, (app) => {
  // Необратимо: удалённые виды и перенос блюд не восстанавливаются.
})
