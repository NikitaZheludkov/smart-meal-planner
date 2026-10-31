/// <reference path="../pb_data/types.d.ts" />
// Мини-гайд для новых пользователей: tour_seen — версия гайда, которую
// пользователь уже видел (0 — не видел). Тем, кто уже пользуется
// приложением, ставим 1: гайд сам не всплывёт, его можно открыть в настройках.
migrate((app) => {
  const users = app.findCollectionByNameOrId('_pb_users_auth_')
  if (!users.fields.getByName('tour_seen')) {
    users.fields.add(new NumberField({ name: 'tour_seen', onlyInt: true, min: 0 }))
    app.save(users)
  }
  app.db().newQuery('UPDATE users SET tour_seen = 1').execute()
}, (app) => {
  const users = app.findCollectionByNameOrId('_pb_users_auth_')
  users.fields.removeByName('tour_seen')
  app.save(users)
})
