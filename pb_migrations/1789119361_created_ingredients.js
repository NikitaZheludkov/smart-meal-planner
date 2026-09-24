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
        "collectionId": "pbc_1868475923",
        "help": "",
        "hidden": false,
        "id": "relation2508033208",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "dish",
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
        "id": "number2392944706",
        "max": null,
        "min": null,
        "name": "amount",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_3146854971",
    "indexes": [],
    "listRule": "household = @request.auth.household",
    "name": "ingredients",
    "system": false,
    "type": "base",
    "updateRule": "household = @request.auth.household",
    "viewRule": "household = @request.auth.household"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3146854971");

  return app.delete(collection);
})
