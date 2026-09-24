/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("dishes")

  // add field
  collection.fields.addAt(collection.fields.length, new Field({
    "hidden": false,
    "id": "bool3819462057",
    "name": "needs_side_dish",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("dishes")

  // remove field
  collection.fields.removeById("bool3819462057")

  return app.save(collection)
})
