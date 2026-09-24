/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("dishes")
  const field = collection.fields.getByName("meal_type")
  field.maxSelect = 999
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("dishes")
  const field = collection.fields.getByName("meal_type")
  field.maxSelect = 1
  return app.save(collection)
})
