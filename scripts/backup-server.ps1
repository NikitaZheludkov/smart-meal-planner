# Бэкап сервера MealMe (grecha-app.ru) на этот компьютер.
#   powershell -ExecutionPolicy Bypass -File scripts\backup-server.ps1
#
# Что попадает в архив:
# - data.db — вся база (пользователи, семьи, блюда, план, покупки). Снимается
#   штатным механизмом SQLite «на ходу», сайт останавливать не нужно;
# - storage — загруженные файлы PocketBase;
# - server/ — то, чего нет в git: ключи (pocketbase.env), настройки Caddy,
#   служба systemd, версия PocketBase, а также pb_hooks и pb_migrations
#   ровно в том виде, в каком они сейчас работают на сервере.
# В pocketbase.env лежат ключи Яндекса и токен бота — архив никому не отдавать.
#
# Как восстановить и переехать — docs/server.md.

$ErrorActionPreference = 'Stop'

$Server = 'root@138.16.181.78'
$Key = Join-Path $env:USERPROFILE '.ssh\smart_meal_planner'
$Dest = Join-Path $env:USERPROFILE 'Личное\Бэкапы\MealMe'
# ssh из Git Bash спотыкается о кириллицу в пути к папке пользователя,
# встроенный в Windows — нет
$Ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$Scp = 'C:\Windows\System32\OpenSSH\scp.exe'

$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$Name = "mealme-backup-$Stamp"

$Remote = @'
set -e
d=/tmp/__NAME__
rm -rf "$d" && mkdir -p "$d/server"
python3 - "$d/data.db" <<'PY'
import sqlite3, sys
src = sqlite3.connect('/opt/pocketbase/pb_data/data.db')
dst = sqlite3.connect(sys.argv[1])
src.backup(dst)
dst.close()
PY
cp -r /opt/pocketbase/pb_data/storage "$d/"
cp /opt/pocketbase/pocketbase.env /etc/caddy/Caddyfile /etc/systemd/system/pocketbase.service "$d/server/"
cp -r /opt/pocketbase/pb_hooks /opt/pocketbase/pb_migrations "$d/server/"
/opt/pocketbase/pocketbase --version > "$d/server/version.txt"
tar -czf "$d.tar.gz" -C /tmp __NAME__
rm -rf "$d"
'@
# Скрипт для сервера передаём в base64 — так не мешают кавычки и переводы
# строк Windows
$Remote = $Remote.Replace('__NAME__', $Name).Replace("`r`n", "`n")
$Encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Remote))

New-Item -ItemType Directory -Force $Dest | Out-Null

Write-Host 'Снимаю копию на сервере...'
& $Ssh -i $Key -o BatchMode=yes $Server "echo $Encoded | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw 'Не удалось снять копию на сервере' }

Write-Host 'Скачиваю...'
& $Scp -i $Key -o BatchMode=yes "${Server}:/tmp/$Name.tar.gz" (Join-Path $Dest "$Name.tar.gz")
if ($LASTEXITCODE -ne 0) { throw 'Не удалось скачать архив' }

& $Ssh -i $Key -o BatchMode=yes $Server "rm -f /tmp/$Name.tar.gz"

$File = Get-Item (Join-Path $Dest "$Name.tar.gz")
Write-Host ("Готово: {0} ({1:N0} КБ)" -f $File.FullName, ($File.Length / 1KB))
