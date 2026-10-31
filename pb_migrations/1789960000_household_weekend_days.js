/// <reference path="../pb_data/types.d.ts" />
// Выходные дни семьи (0 = вс … 6 = сб) — у всех свои. По ним «Идеи на
// неделю» ставят блюда «Выходного дня» на выходные. Пусто — суббота и
// воскресенье.
migrate((app) => {
  const households = app.findCollectionByNameOrId('households')
  if (!households.fields.getByName('weekend_days')) {
    households.fields.add(new JSONField({ name: 'weekend_days', maxSize: 200 }))
  }
  app.save(households)
}, (app) => {
  const households = app.findCollectionByNameOrId('households')
  households.fields.removeByName('weekend_days')
  app.save(households)
})
