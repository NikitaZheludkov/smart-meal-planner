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
        "help": "",
        "hidden": false,
        "id": "date2862495610",
        "max": "",
        "min": "",
        "name": "date",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_491409782",
        "help": "",
        "hidden": false,
        "id": "relation2516616413",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "meal_type",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
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
        "required": false,
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
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number3387148811",
        "max": null,
        "min": null,
        "name": "portions",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "bool105959652",
        "name": "ignore_shopping",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_4200021197",
    "indexes": [],
    "listRule": "household = @request.auth.household",
    "name": "plan",
    "system": false,
    "type": "base",
    "updateRule": "household = @request.auth.household",
    "viewRule": "household = @request.auth.household"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4200021197");

  return app.delete(collection);
})
