/// <reference path="../pb_data/types.d.ts" />
// Панель администратора:
// - app_admins: кто админ. Писать может только суперюзер (/_/) и хуки,
//   поэтому пользователь не может сделать себя админом сам. Читать —
//   только свою запись (фронт так узнаёт, показывать ли раздел).
// - app_settings: настройки приложения (key → JSON). Читать могут все,
//   менять — только через /api/admin/settings.
// Первый админ берётся из переменной окружения SUPERADMIN_EMAIL.
migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  const admins = new Collection({
    type: 'base',
    name: 'app_admins',
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_app_admins_user ON app_admins (user)']
  })
  app.save(admins)

  const settings = new Collection({
    type: 'base',
    name: 'app_settings',
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'key', type: 'text', required: true, max: 64 },
      { name: 'value', type: 'json', maxSize: 20000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (`key`)']
  })
  app.save(settings)

  const defaults = {
    registration_open: true,
    voice_input_enabled: true,
    announcement: { enabled: false, text: '' }
  }
  for (const [key, value] of Object.entries(defaults)) {
    const record = new Record(settings)
    record.set('key', key)
    record.set('value', value)
    app.save(record)
  }

  const email = ($os.getenv('SUPERADMIN_EMAIL') || '').trim().toLowerCase()
  if (email) {
    try {
      const user = app.findAuthRecordByEmail('users', email)
      const record = new Record(admins)
      record.set('user', user.id)
      app.save(record)
    } catch (err) {
      console.log(`SUPERADMIN_EMAIL=${email}: пользователь не найден, админ не назначен`)
    }
  }
}, (app) => {
  for (const name of ['app_admins', 'app_settings']) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
})
