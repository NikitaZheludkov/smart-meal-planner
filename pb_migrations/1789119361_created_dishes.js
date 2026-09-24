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
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1579384326",
        "max": 200,
        "min": 0,
        "name": "name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_3451558893",
        "help": "",
        "hidden": false,
        "id": "relation115140664",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "dish_type",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
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
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2174078383",
        "help": "",
        "hidden": false,
        "id": "relation1874629670",
        "maxSelect": 999,
        "minSelect": 0,
        "name": "tags",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1843675174",
        "max": 5000,
        "min": 0,
        "name": "description",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number3205541362",
        "max": null,
        "min": null,
        "name": "kcal",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number2566447538",
        "max": null,
        "min": null,
        "name": "protein",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number2559934787",
        "max": null,
        "min": null,
        "name": "fat",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number1385758587",
        "max": null,
        "min": null,
        "name": "carbs",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "bool3036131748",
        "name": "is_batch",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number2497171052",
        "max": null,
        "min": null,
        "name": "batch_yield",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text2895943165",
        "max": 2000,
        "min": 0,
        "name": "image_url",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
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
      }
    ],
    "id": "pbc_1868475923",
    "indexes": [],
    "listRule": "household = @request.auth.household",
    "name": "dishes",
    "system": false,
    "type": "base",
    "updateRule": "household = @request.auth.household",
    "viewRule": "household = @request.auth.household"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1868475923");

  return app.delete(collection);
})
