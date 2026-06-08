const getYandexApiKey = () => {
  const key = ($os.getenv('YANDEX_API_KEY') || '').trim()
  if (!key) {
    throw new InternalServerError('YANDEX_API_KEY не задана в окружении сервера PocketBase')
  }
  return key
}

routerAdd(
  'POST',
  '/api/yandex-stt/speech/v1/stt:recognize',
  (e) => {
    const yandexKey = getYandexApiKey()

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

    const res = $http.send({
      url,
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${yandexKey}`,
        'Content-Type': contentType
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
    const yandexKey = getYandexApiKey()

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
