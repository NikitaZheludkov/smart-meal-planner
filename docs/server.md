# Сервер MealMe: бэкап, восстановление, переезд

## Как устроено

- Хостинг VDSina, сервер `138.16.181.78`, вход `root` по ключу `~/.ssh/smart_meal_planner`.
- Домен `grecha-app.ru` (и `www`) указывает на этот сервер.
- PocketBase 0.40.3 в `/opt/pocketbase`, служба `pocketbase` (systemd), слушает `127.0.0.1:8090`.
  - `pb_data/data.db` — вся база; `pb_data/auxiliary.db` — только логи, в бэкап не берём.
  - `pocketbase.env` — ключи: Яндекс (голос), токен и секрет вебхука Telegram-бота, почта главного админа.
  - `pb_hooks`, `pb_migrations` — копии из git.
- Caddy (`/etc/caddy/Caddyfile`) отдаёт сайт из `/var/www/grecha-app` (это `dist` после `npm run build`), а `/api` и `/_/` передаёт в PocketBase. HTTPS-сертификат Caddy получает сам.

## Бэкап

```
powershell -ExecutionPolicy Bypass -File scripts\backup-server.ps1
```

Архив `mealme-backup-<дата>.tar.gz` попадает в `C:\Users\Никита\Личное\Бэкапы\MealMe`. Внутри — база, файлы, ключи и настройки сервера (что именно — в шапке скрипта). В архиве ключи: никому не отдавать.

Сайт при бэкапе не останавливается.

## Восстановление на том же сервере

1. Сначала свежий бэкап текущего состояния — на случай, если восстанавливаем не то.
2. `systemctl stop pocketbase`
3. Положить `data.db` из архива в `/opt/pocketbase/pb_data/`, владелец `pocketbase:pocketbase`.
4. `systemctl start pocketbase`, открыть сайт и проверить.

## Переезд на новый сервер

1. Новый сервер на Ubuntu/Debian. Создать пользователя `pocketbase`.
2. Скачать PocketBase той же версии (`server/version.txt`) в `/opt/pocketbase`.
3. Из архива: `data.db` и `storage` → `/opt/pocketbase/pb_data/`; `pocketbase.env` → `/opt/pocketbase/`; `pb_hooks` и `pb_migrations` — из git (или из архива, если в git другие).
4. `pocketbase.service` → `/etc/systemd/system/`, затем `systemctl enable --now pocketbase`.
5. Поставить Caddy, `Caddyfile` → `/etc/caddy/`.
6. `npm run build` на компьютере, содержимое `dist` → `/var/www/grecha-app`.
7. Переключить DNS домена на новый IP. Caddy сам получит сертификат, когда домен заработает.
8. Telegram-бот: вебхук ведёт на `grecha-app.ru`, при том же домене ничего менять не нужно. Если домен другой — поменять адрес в `pb_hooks/main.pb.js` (кнопка Mini App и вебхук) и в настройках бота у BotFather.
9. Поменять IP в `scripts/backup-server.ps1` и в этом файле.
