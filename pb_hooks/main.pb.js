// ПРИМЕЧАНИЕ: getYandexApiKey() специально объявлена внутри каждого
// routerAdd-колбэка, а не как общая top-level функция — PocketBase выполняет
// тело каждого колбэка изолированно и не видит другие top-level const/function
// из этого файла (проверено эмпирически при добавлении /api/telegram-auth).
routerAdd(
  'POST',
  '/api/yandex-stt/speech/v1/stt:recognize',
  (e) => {
    // Прокси тратит платный ключ Yandex — только для вошедших пользователей
    // и только пока голосовой ввод включён в панели администратора.
    if (!e.auth) {
      throw new UnauthorizedError('Нужно войти в аккаунт')
    }
    if (require(`${__hooks}/admin_utils.js`).getSetting('voice_input_enabled') === false) {
      throw new ForbiddenError('Голосовой ввод временно отключён')
    }

    const yandexKey = ($os.getenv('YANDEX_API_KEY') || '').trim()
    if (!yandexKey) {
      throw new InternalServerError('YANDEX_API_KEY не задана в окружении сервера PocketBase')
    }

    const pickHeader = (headers, name) => {
      const direct = headers?.[name]
      if (direct && direct.length) return direct[0]
      const lower = headers?.[name.toLowerCase()]
      if (lower && lower.length) return lower[0]
      return ''
    }

    const buildQueryString = (queryValues) => {      const obj = JSON.parse(toString(queryValues || {})) || {}
      const parts = []
      for (const [key, value] of Object.entries(obj)) {
        const k = encodeURIComponent(String(key))
        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v === undefined || v === null) return
            parts.push(`${k}=${encodeURIComponent(String(v))}`)
          })
        } else if (value !== undefined && value !== null) {
          parts.push(`${k}=${encodeURIComponent(String(value))}`)
        }
      }
      return parts.length ? `?${parts.join('&')}` : ''
    }

    const query = buildQueryString(e.request.url.query())
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize${query}`
    const contentType = e.request.header.get('Content-Type') || 'application/octet-stream'

    const bodyBytes = toBytes(e.request.body)
    const contentLength = Array.isArray(bodyBytes) ? bodyBytes.length : (bodyBytes?.length || bodyBytes?.byteLength || 0)

    const res = $http.send({
      url,
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${yandexKey}`,
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
        Accept: 'application/json'
      },
      body: bodyBytes,
      timeout: 180
    })

    const ct = pickHeader(res.headers, 'Content-Type') || 'application/json'
    return e.blob(res.statusCode, ct, res.body)
  },
  $apis.bodyLimit(52428800)
)

routerAdd(
  'POST',
  '/api/yandex-llm/foundationModels/v1/completion',
  (e) => {
    // Прокси тратит платный ключ Yandex — только для вошедших пользователей
    // и только пока голосовой ввод включён в панели администратора.
    if (!e.auth) {
      throw new UnauthorizedError('Нужно войти в аккаунт')
    }
    if (require(`${__hooks}/admin_utils.js`).getSetting('voice_input_enabled') === false) {
      throw new ForbiddenError('Голосовой ввод временно отключён')
    }

    const yandexKey = ($os.getenv('YANDEX_API_KEY') || '').trim()
    if (!yandexKey) {
      throw new InternalServerError('YANDEX_API_KEY не задана в окружении сервера PocketBase')
    }

    const pickHeader = (headers, name) => {
      const direct = headers?.[name]
      if (direct && direct.length) return direct[0]
      const lower = headers?.[name.toLowerCase()]
      if (lower && lower.length) return lower[0]
      return ''
    }

    const contentType = e.request.header.get('Content-Type') || 'application/json'
    const body = toString(e.request.body)

    const res = $http.send({
      url: 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${yandexKey}`,
        'Content-Type': contentType
      },
      body,
      timeout: 180
    })

    const ct = pickHeader(res.headers, 'Content-Type') || 'application/json'
    return e.blob(res.statusCode, ct, res.body)
  },
  $apis.bodyLimit(52428800)
)

// ---------------------------------------------------------------------
// Вход в приложение через Telegram Mini App — без пароля. Telegram сам
// подтвердил личность пользователя через подписанный initData; задача
// этого эндпоинта — проверить подпись и найти-или-создать запись в users.
//
// ВАЖНО про структуру этого хука: PocketBase выполняет тело каждого
// routerAdd-колбэка изолированно и НЕ видит внутри него другие top-level
// const/function, объявленные в этом же файле (проверено эмпирически —
// даже уже существующий getYandexApiKey недоступен изнутри своих же
// routerAdd-обработчиков). Поэтому все хелперы объявлены прямо внутри
// колбэка, а не вынесены на верхний уровень файла.
//
// Почему SHA-256/HMAC реализованы вручную, а не через $security.hs256:
// этой встроенной функции нужен секрет как текстовая строка, а протокол
// Telegram Mini Apps на втором шаге требует HMAC с "сырым" 32-байтовым
// ключом (результатом первого HMAC). Произвольные байты не проходят без
// потерь через границу Go/JS-строк (goja кодирует/декодирует их как UTF-8,
// байты вне ASCII-диапазона искажаются) — поэтому весь расчёт ведётся в
// чистом JS над Array<number>, не пересекая эту границу. Корректность
// самой реализации SHA-256/HMAC проверена на этом сервере отдельным
// self-test роутом против эталонных значений из Node.js crypto.
routerAdd('POST', '/api/telegram-auth', (e) => {
  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]

  const rightRotate = (x, n) => (x >>> n) | (x << (32 - n))

  const sha256Bytes = (bytes) => {
    const bitLen = bytes.length * 8
    const padded = bytes.slice()
    padded.push(0x80)
    while (padded.length % 64 !== 56) padded.push(0)
    padded.push(0, 0, 0, 0)
    padded.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff)

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

    for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
      const w = new Array(64).fill(0)
      for (let i = 0; i < 16; i++) {
        const o = chunkStart + i * 4
        w[i] = ((padded[o] << 24) | (padded[o + 1] << 16) | (padded[o + 2] << 8) | padded[o + 3]) >>> 0
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
      }

      let a = h0, b = h1, c = h2, d = h3, e2 = h4, f = h5, g = h6, h = h7
      for (let i = 0; i < 64; i++) {
        const S1 = rightRotate(e2, 6) ^ rightRotate(e2, 11) ^ rightRotate(e2, 25)
        const ch = (e2 & f) ^ (~e2 & g)
        const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
        const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
        const maj = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = (S0 + maj) >>> 0
        h = g; g = f; f = e2; e2 = (d + temp1) >>> 0
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
      }

      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
      h4 = (h4 + e2) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
    }

    const out = []
    for (const h of [h0, h1, h2, h3, h4, h5, h6, h7]) {
      out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff)
    }
    return out
  }

  const hmacSha256Bytes = (keyBytes, messageBytes) => {
    const blockSize = 64
    let key = keyBytes
    if (key.length > blockSize) key = sha256Bytes(key)
    if (key.length < blockSize) key = key.concat(new Array(blockSize - key.length).fill(0))

    const oKeyPad = key.map((b) => b ^ 0x5c)
    const iKeyPad = key.map((b) => b ^ 0x36)

    const inner = sha256Bytes(iKeyPad.concat(messageBytes))
    return sha256Bytes(oKeyPad.concat(inner))
  }

  const utf8ToBytes = (str) => {
    const bytes = []
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const low = str.charCodeAt(i + 1)
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + (code - 0xd800) * 0x400 + (low - 0xdc00)
          i++
        }
      }
      if (code < 0x80) {
        bytes.push(code)
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      } else {
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      }
    }
    return bytes
  }

  const byteToHex = (b) => {
    const s = b.toString(16)
    return s.length === 1 ? '0' + s : s
  }

  const bytesToHex = (bytes) => bytes.map(byteToHex).join('')

  const botToken = ($os.getenv('TELEGRAM_BOT_TOKEN') || '').trim()
  if (!botToken) {
    throw new InternalServerError('TELEGRAM_BOT_TOKEN не задан в окружении сервера PocketBase')
  }

  const data = new DynamicModel({ initData: '', createIfMissing: false })
  e.bindBody(data)

  const initDataRaw = data.initData
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    throw new UnauthorizedError('initData отсутствует')
  }

  const fields = {}
  for (const pair of initDataRaw.split('&')) {
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    const key = eqIdx === -1 ? pair : pair.slice(0, eqIdx)
    const rawValue = eqIdx === -1 ? '' : pair.slice(eqIdx + 1)
    fields[decodeURIComponent(key)] = decodeURIComponent(rawValue)
  }

  const receivedHash = (fields.hash || '').toLowerCase()
  delete fields.hash
  if (!receivedHash) {
    throw new UnauthorizedError('Отсутствует подпись initData')
  }

  const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n')

  const secretKeyBytes = hmacSha256Bytes(utf8ToBytes('WebAppData'), utf8ToBytes(botToken))
  const computedHash = bytesToHex(hmacSha256Bytes(secretKeyBytes, utf8ToBytes(dataCheckString)))

  if (!$security.equal(computedHash, receivedHash)) {
    throw new UnauthorizedError('Неверная подпись initData')
  }

  const authDate = parseInt(fields.auth_date, 10)
  const MAX_INIT_DATA_AGE_SECONDS = 86400
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new UnauthorizedError('initData устарел, откройте приложение заново')
  }

  let tgUser
  try {
    tgUser = JSON.parse(fields.user || '{}')
  } catch (err) {
    throw new UnauthorizedError('Некорректные данные пользователя Telegram')
  }
  if (!tgUser || !tgUser.id) {
    throw new UnauthorizedError('В initData нет данных пользователя')
  }

  const telegramId = String(tgUser.id)

  // Если запрос пришёл с уже валидным токеном авторизации (PocketBase сам
  // резолвит e.auth из заголовка Authorization на любом роуте, не только
  // защищённых) — это не вход, а привязка Telegram к уже открытому
  // аккаунту (кнопка "Привязать Telegram" в Настройках), а не логин/регистрация.
  if (e.auth) {
    let linkedToAnother = null
    try {
      linkedToAnother = $app.findFirstRecordByFilter(
        'users',
        'telegram_id = {:tid} && id != {:uid}',
        { tid: telegramId, uid: e.auth.id }
      )
    } catch (err) {
      linkedToAnother = null
    }

    // Валидная подпись initData сама по себе доказывает, что именно этот
    // человек владеет данным Telegram-аккаунтом (подделать её без токена
    // бота невозможно) — поэтому, если telegram_id уже стоял на другом
    // аккаунте (типичный случай: сначала случайно открыл через бота и
    // автосоздался пустой Telegram-аккаунт, потом вспомнил про старый
    // email), просто переносим привязку, а не блокируем как угон чужого.
    if (linkedToAnother) {
      linkedToAnother.set('telegram_id', '')
      $app.save(linkedToAnother)
    }

    e.auth.set('telegram_id', telegramId)
    $app.save(e.auth)
    return e.json(200, { success: true })
  }

  let record = null
  try {
    record = $app.findFirstRecordByFilter('users', 'telegram_id = {:tid}', { tid: telegramId })
  } catch (err) {
    record = null
  }

  if (!record) {
    // Этот Telegram-аккаунт впервые открывает приложение. НЕ создаём нового
    // пользователя молча — если у человека уже есть email-аккаунт, он
    // потеряет доступ к своим данным (наступил на эти грабли в тестах).
    // Фронтенд должен явно спросить и повторить запрос с createIfMissing,
    // только когда пользователь подтвердил, что аккаунта раньше не было.
    if (!data.createIfMissing) {
      return e.json(200, {
        status: 'not_found',
        tgUser: {
          firstName: tgUser.first_name || '',
          username: tgUser.username || ''
        }
      })
    }

    if (require(`${__hooks}/admin_utils.js`).getSetting('registration_open') === false) {
      throw new BadRequestError('Регистрация новых аккаунтов временно закрыта')
    }

    const usersCollection = $app.findCollectionByNameOrId('users')
    record = new Record(usersCollection)
    record.set('telegram_id', telegramId)
    record.set('email', `tg_${telegramId}@telegram.local`)
    record.set('password', $security.randomString(40))
    record.set('first_name', tgUser.first_name || tgUser.username || 'Telegram')
    record.set('verified', true)
    $app.save(record)
  }

  return $apis.recordAuthResponse(e, record, 'telegram')
})

// ---------------------------------------------------------------------
// Восстановление пароля через бота — альтернатива email-ссылке для
// аккаунтов с привязанным Telegram (см. /api/telegram-auth выше, режим
// привязки). Не требует настроенного SMTP на сервере.
//
// Оба ответа ниже намеренно одинаковы независимо от того, существует ли
// email и привязан ли к нему Telegram — чтобы нельзя было перебором узнать,
// какие адреса зарегистрированы (тот же принцип, что у встроенного
// requestPasswordReset у PocketBase).
routerAdd('POST', '/api/telegram-recovery/request', (e) => {
  const botToken = ($os.getenv('TELEGRAM_BOT_TOKEN') || '').trim()
  if (!botToken) {
    throw new InternalServerError('TELEGRAM_BOT_TOKEN не задан в окружении сервера PocketBase')
  }

  const data = new DynamicModel({ email: '' })
  e.bindBody(data)
  const email = (data.email || '').trim().toLowerCase()

  if (email) {
    let record = null
    try {
      record = $app.findFirstRecordByFilter('users', 'email = {:email}', { email })
    } catch (err) {
      record = null
    }

    const telegramId = record ? record.get('telegram_id') : ''
    if (record && telegramId) {
      const code = $security.randomStringWithAlphabet(6, '0123456789')
      const expiresAt = Math.floor(Date.now() / 1000) + 600 // 10 минут

      record.set('reset_otp_hash', $security.sha256(code))
      record.set('reset_otp_expires', expiresAt)
      $app.save(record)

      try {
        $http.send({
          url: `https://api.telegram.org/bot${botToken}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text: `Код для восстановления пароля MealMe: ${code}\n\nДействует 10 минут. Если вы не запрашивали восстановление — просто проигнорируйте сообщение.`
          }),
          timeout: 15
        })
      } catch (err) {
        // Не проваливаем запрос из-за сетевой проблемы с Telegram API —
        // ответ клиенту всё равно одинаковый, повторный запрос перегенерит код.
      }
    }
  }

  return e.json(200, { success: true })
})

routerAdd('POST', '/api/telegram-recovery/confirm', (e) => {
  const data = new DynamicModel({ email: '', code: '', password: '', passwordConfirm: '' })
  e.bindBody(data)

  const email = (data.email || '').trim().toLowerCase()
  const code = (data.code || '').trim()
  const password = data.password || ''
  const passwordConfirm = data.passwordConfirm || ''

  if (!email || !code) {
    throw new BadRequestError('Заполните код из Telegram')
  }
  if (password.length < 8) {
    throw new BadRequestError('Пароль должен быть не короче 8 символов')
  }
  if (password !== passwordConfirm) {
    throw new BadRequestError('Пароли не совпадают')
  }

  let record = null
  try {
    record = $app.findFirstRecordByFilter('users', 'email = {:email}', { email })
  } catch (err) {
    record = null
  }

  // "Неверный или устаревший код" — единая ошибка и для отсутствующего
  // аккаунта, и для неверного/просроченного кода (см. комментарий выше).
  const storedHash = record ? record.get('reset_otp_hash') : ''
  const expiresAt = record ? record.get('reset_otp_expires') : 0
  const now = Math.floor(Date.now() / 1000)

  if (!record || !storedHash || !expiresAt || now > expiresAt || !$security.equal($security.sha256(code), storedHash)) {
    throw new BadRequestError('Неверный или устаревший код')
  }

  record.set('password', password)
  record.set('reset_otp_hash', '')
  record.set('reset_otp_expires', 0)
  $app.save(record)

  return e.json(200, { success: true })
})

// ---------------------------------------------------------------------
// Позволяет пользователю, который зарегистрировался через Telegram (и
// поэтому имеет синтетический email вида tg_<id>@telegram.local и случайный
// пароль, которого он никогда не видел), задать себе настоящие email и
// пароль — запасной способ входа, если Telegram станет недоступен, и
// необходимое условие для восстановления пароля через бота (там нужно
// знать, какой email вводить).
//
// Намеренно НЕ используем обычный self-update через REST API: PocketBase
// требует oldPassword при смене пароля через него (защита от угона токена),
// а у пользователя его нет и быть не может — он никогда не видел свой
// текущий пароль. Поэтому меняем напрямую через $app, но только когда
// текущий email ещё синтетический — так это нельзя использовать, чтобы
// тихо перехватить пароль уже настоящего email-аккаунта угнанным токеном.
routerAdd('POST', '/api/set-email-password', (e) => {
  if (!e.auth) {
    throw new UnauthorizedError('Нужно быть авторизованным')
  }

  const currentEmail = e.auth.get('email') || ''
  if (!/^tg_\d+@telegram\.local$/.test(currentEmail)) {
    throw new BadRequestError('У этого аккаунта уже есть email и пароль — смените их через обычную форму')
  }

  const data = new DynamicModel({ email: '', password: '', passwordConfirm: '' })
  e.bindBody(data)

  const email = (data.email || '').trim().toLowerCase()
  const password = data.password || ''
  const passwordConfirm = data.passwordConfirm || ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError('Введите корректный email')
  }
  if (password.length < 8) {
    throw new BadRequestError('Пароль должен быть не короче 8 символов')
  }
  if (password !== passwordConfirm) {
    throw new BadRequestError('Пароли не совпадают')
  }

  let existing = null
  try {
    existing = $app.findFirstRecordByFilter('users', 'email = {:email} && id != {:uid}', { email, uid: e.auth.id })
  } catch (err) {
    existing = null
  }
  if (existing) {
    throw new BadRequestError('Этот email уже используется другим аккаунтом')
  }

  e.auth.set('email', email)
  e.auth.set('password', password)
  $app.save(e.auth)

  // Смена пароля рутинно перевыпускает tokenKey записи, из-за чего токен,
  // которым пришёл этот же запрос, тут же становится недействителен —
  // поэтому сразу возвращаем свежий токен, а не просим клиент обновить
  // сессию по старому.
  return $apis.recordAuthResponse(e, e.auth, 'password')
})

// ---------------------------------------------------------------------
// Вебхук от Telegram: сюда прилетают апдейты бота (сообщения, команды).
// Единственное, что бот сейчас умеет — отвечать на /start кнопкой,
// открывающей Mini App одним тапом. Без этого человек, открыв бота
// впервые, видел молчание и не понимал, что делать дальше.
routerAdd('POST', '/api/telegram-webhook', (e) => {
  const webhookSecret = ($os.getenv('TELEGRAM_WEBHOOK_SECRET') || '').trim()
  const receivedSecret = e.request.header.get('X-Telegram-Bot-Api-Secret-Token') || ''
  if (!webhookSecret || receivedSecret !== webhookSecret) {
    throw new UnauthorizedError('Неверный секрет вебхука')
  }

  const botToken = ($os.getenv('TELEGRAM_BOT_TOKEN') || '').trim()
  if (!botToken) {
    throw new InternalServerError('TELEGRAM_BOT_TOKEN не задан в окружении сервера PocketBase')
  }

  let update = null
  try {
    update = JSON.parse(toString(e.request.body))
  } catch (err) {
    update = null
  }

  const chatId = update?.message?.chat?.id
  const text = (update?.message?.text || '').trim()

  if (chatId && text.indexOf('/start') === 0) {
    try {
      $http.send({
        url: `https://api.telegram.org/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '👋 Привет! MealMe — планировщик питания. Открой приложение одним тапом:',
          reply_markup: {
            inline_keyboard: [[
              { text: '🥗 Открыть MealMe', web_app: { url: 'https://grecha-app.ru' } }
            ]]
          }
        }),
        timeout: 15
      })
    } catch (err) {
      // Апдейт нужно подтвердить 200 в любом случае — иначе Telegram будет
      // присылать его повторно. Сбой отправки ответа тут не критичен.
    }
  }

  return e.json(200, { ok: true })
})

// Одноразовая (идемпотентная — безопасно вызывать повторно) регистрация
// вебхука у Telegram. Токен и секрет читаются из окружения сервера и
// наружу не уходят — наружу уходит только сам факт регистрации.
routerAdd('GET', '/api/telegram-register-webhook', (e) => {
  const botToken = ($os.getenv('TELEGRAM_BOT_TOKEN') || '').trim()
  const webhookSecret = ($os.getenv('TELEGRAM_WEBHOOK_SECRET') || '').trim()
  if (!botToken || !webhookSecret) {
    throw new InternalServerError('TELEGRAM_BOT_TOKEN или TELEGRAM_WEBHOOK_SECRET не заданы')
  }

  const res = $http.send({
    url: `https://api.telegram.org/bot${botToken}/setWebhook`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://grecha-app.ru/api/telegram-webhook',
      secret_token: webhookSecret,
      drop_pending_updates: true
    }),
    timeout: 15
  })

  return e.blob(res.statusCode, 'application/json', res.body)
})

// При создании НОВОЙ семьи (households) — а не при вступлении в чужую по
// инвайт-коду, это отдельный путь без создания записи households —
// копируем эталонный список product_templates в products новой семьи.
// Так у каждой свежесозданной семьи сразу есть база продуктов для старта,
// а у семей, которые просто пополняются новыми участниками, дублей не
// появляется.
onRecordAfterCreateSuccess((e) => {
  try {
    const templates = $app.findRecordsByFilter('product_templates', '', 'sort_order', 1000, 0)
    const productsCollection = $app.findCollectionByNameOrId('products')

    for (const tpl of templates) {
      const record = new Record(productsCollection)
      record.set('household', e.record.id)
      record.set('name', tpl.get('name'))
      record.set('category', tpl.get('category'))
      record.set('unit', tpl.get('unit'))
      $app.save(record)
    }
  } catch (err) {
    console.log('Seed default products failed:', err)
  }

  e.next()
}, 'households')
