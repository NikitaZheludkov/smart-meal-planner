/// <reference path="../pb_data/types.d.ts" />
// Способ готовки блюда: без готовки / варить / запекать / жарить. Пока только
// отметка — по ней потом можно точнее учесть масло в КБЖУ. Необязательное.
migrate((app) => {
  const dishes = app.findCollectionByNameOrId('dishes')
  if (!dishes.fields.getByName('cooking_method')) {
    dishes.fields.add(new SelectField({
      name: 'cooking_method',
      values: ['raw', 'boil', 'bake', 'fry'],
      maxSelect: 1
    }))
    app.save(dishes)
  }
}, (app) => {
  const dishes = app.findCollectionByNameOrId('dishes')
  dishes.fields.removeByName('cooking_method')
  app.save(dishes)
})
