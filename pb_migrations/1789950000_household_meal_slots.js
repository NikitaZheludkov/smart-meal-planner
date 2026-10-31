/// <reference path="../pb_data/types.d.ts" />
// Семья выбирает, какие приёмы пищи видны в сетке недели (например, без
// перекуса). Храним скрытые — новые приёмы из справочника видны сразу.
// Настройки плана общие для семьи, поэтому их может менять любой участник;
// владелец, название и код приглашения — только владелец.
const OWNER_RULE = '@request.auth.id != "" && owner = @request.auth.id'
const MEMBER_RULE = '@request.auth.id != "" && (owner = @request.auth.id || (id = @request.auth.household && ' +
  '@request.body.owner:isset = false && @request.body.name:isset = false && @request.body.invite_code:isset = false))'

migrate((app) => {
  const households = app.findCollectionByNameOrId('households')
  const mealTypes = app.findCollectionByNameOrId('meal_types')
  if (!households.fields.getByName('hidden_meal_types')) {
    households.fields.add(new RelationField({
      name: 'hidden_meal_types',
      collectionId: mealTypes.id,
      maxSelect: 99,
      cascadeDelete: false
    }))
  }
  households.updateRule = MEMBER_RULE
  app.save(households)
}, (app) => {
  const households = app.findCollectionByNameOrId('households')
  households.fields.removeByName('hidden_meal_types')
  households.updateRule = OWNER_RULE
  app.save(households)
})
