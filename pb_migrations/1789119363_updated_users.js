/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\" && household = @request.auth.household",
    "updateRule": "@request.auth.id != \"\" && id = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && (id = @request.auth.id || household = @request.auth.household)"
  }, collection)

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text2849095986",
    "max": 100,
    "min": 0,
    "name": "first_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2123300356",
    "help": "",
    "hidden": false,
    "id": "relation1422077888",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "household",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "listRule": "id = @request.auth.id",
    "updateRule": "id = @request.auth.id",
    "viewRule": "id = @request.auth.id"
  }, collection)

  // remove field
  collection.fields.removeById("text2849095986")

  // remove field
  collection.fields.removeById("relation1422077888")

  return app.save(collection)
})
