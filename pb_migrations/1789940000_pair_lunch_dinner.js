/// <reference path="../pb_data/types.d.ts" />
// Обед и ужин у блюд объединены в категорию «Обед/Ужин»: у каждого блюда,
// где отмечен только один из них, дописываем второй. Дальше это делает хук
// в main.pb.js при каждом сохранении.
migrate((app) => {
  let lunch, dinner
  try {
    lunch = app.findFirstRecordByData('meal_types', 'name', 'Обед').id
    dinner = app.findFirstRecordByData('meal_types', 'name', 'Ужин').id
  } catch (_) {
    return
  }

  const dishes = app.findRecordsByFilter('dishes', 'meal_type ~ {:a} || meal_type ~ {:b}', '', 0, 0, { a: lunch, b: dinner })
  for (const dish of dishes) {
    const slice = dish.getStringSlice('meal_type') || []
    const ids = []
    for (let i = 0; i < slice.length; i++) ids.push(slice[i])
    const hasLunch = ids.indexOf(lunch) !== -1
    const hasDinner = ids.indexOf(dinner) !== -1
    if (hasLunch === hasDinner) continue
    ids.push(hasLunch ? dinner : lunch)
    dish.set('meal_type', ids)
    app.saveNoValidate(dish)
  }
}, (app) => {
  // Необратимо: какой из двух приёмов был отмечен изначально, не храним
})
