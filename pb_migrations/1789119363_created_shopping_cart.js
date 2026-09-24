/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "household = @request.auth.household",
    "deleteRule": "household = @request.auth.household",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2123300356",
        "help": "",
        "hidden": false,
        "id": "relation1422077888",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "household",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_4092854851",
        "help": "",
        "hidden": false,
        "id": "relation3544843437",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "product",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "help": "",
        "hidden": false,
        "id": "bool3141483595",
        "name": "is_checked",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "help": "",
        "hidden": false,
        "id": "date1130519967",
        "max": "",
        "min": "",
        "name": "updated_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_2610882951",
    "indexes": [],
    "listRule": "household = @request.auth.household",
    "name": "shopping_cart",
    "system": false,
    "type": "base",
    "updateRule": "household = @request.auth.household",
    "viewRule": "household = @request.auth.household"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2610882951");

  return app.delete(collection);
})
