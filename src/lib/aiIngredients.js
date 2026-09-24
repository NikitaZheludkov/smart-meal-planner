const SYSTEM_UNITS = ['Кг', 'Г', 'Л', 'Мл', 'Шт', 'Упак']
const STOP_WORDS = new Set(['соус', 'масло', 'сыр'])
const NAME_MATCH_MIN_SCORE = 84
// \b — ASCII-only в JS (даже с флагом 'u'): после кириллической буквы граница
// слова никогда не срабатывает, потому что кириллица не входит в \w. Поэтому
// вместо \b используется ручной lookahead "не продолжается буквой/цифрой" —
// иначе распознавание единиц на кириллице не работало бы вовсе.
const MEASUREMENT_RE = /(\d+(?:[.,]\d+)?)\s*(кг|kg|килограмм(?:а|ов)?|кил|грамм(?:а|ов)?|гр|г|g|литр(?:а|ов)?|л|l|миллилитр(?:а|ов)?|мл|ml|шт|штука|штуки|штук|pcs?|pc|piece|pieces|упак|упаковка|упаковки|пачка|пачки|пачек|пакет|пакета|пакетов|pack|packs)(?![\p{L}\p{N}])/iu

// Каждый алиас — это единица измерения, которую может произнести пользователь
// или прислать AI. Мы не решаем здесь, в какую системную единицу её
// переводить — это зависит от того, в чём хранится конкретный продукт
// (например, "500 г" для курицы, которая хранится в Кг, и для соли, которая
// хранится в Г, — это два разных пересчёта). Вместо этого каждый алиас несёт
// "измерение" (масса/объём/счёт) и коэффициент к базовой единице этого
// измерения (граммы для массы, миллилитры для объёма) — а фактический
// пересчёт в единицу продукта происходит в convertToProductUnit(), когда
// продукт уже известен.
const UNIT_ALIASES = [
  { re: /^(кг|kg|килограмм(а|ов)?|кил)(?![\p{L}\p{N}])/u, dimension: 'mass', toBase: 1000, defaultUnit: 'Кг', defaultMultiplier: 1 },
  { re: /^(г|гр|g|грамм(а|ов)?)(?![\p{L}\p{N}])/u, dimension: 'mass', toBase: 1, defaultUnit: 'Кг', defaultMultiplier: 0.001 },
  { re: /^(л|l|литр(а|ов)?)(?![\p{L}\p{N}])/u, dimension: 'volume', toBase: 1000, defaultUnit: 'Л', defaultMultiplier: 1 },
  { re: /^(мл|ml|миллилитр(а|ов)?)(?![\p{L}\p{N}])/u, dimension: 'volume', toBase: 1, defaultUnit: 'Л', defaultMultiplier: 0.001 },
  { re: /^(шт|pcs?|pc|piece|pieces|штука|штуки|штук)(?![\p{L}\p{N}])/u, dimension: 'count', unit: 'Шт', defaultUnit: 'Шт', defaultMultiplier: 1 },
  { re: /^(упак|упаковка|упаковки|пачка|пачки|пачек|пакет|пакета|пакетов|pack|packs)(?![\p{L}\p{N}])/u, dimension: 'count', unit: 'Упак', defaultUnit: 'Упак', defaultMultiplier: 1 }
]

// Пересчитывает распознанное количество (rawAmount в единице alias) в
// единицу конкретного продукта. Возвращает null, если единицы физически
// несовместимы (например, распознали объём, а продукт считается в штуках).
const convertToProductUnit = (alias, rawAmount, productUnit) => {
  if (!alias || !Number.isFinite(rawAmount)) return null
  if (alias.dimension === 'mass') {
    const grams = rawAmount * alias.toBase
    if (productUnit === 'Кг') return grams / 1000
    if (productUnit === 'Г') return grams
    return null
  }
  if (alias.dimension === 'volume') {
    const ml = rawAmount * alias.toBase
    if (productUnit === 'Л') return ml / 1000
    if (productUnit === 'Мл') return ml
    return null
  }
  if (alias.dimension === 'count') {
    return productUnit === alias.unit ? rawAmount : null
  }
  return null
}

const parseNumericValue = (value) => {
  if (value === null || value === undefined) return null
  const normalized = value.toString().trim().replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const capitalizeDisplayName = (value) => {
  const text = (value || '').toString().trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const getUnitInfo = (unitString) => {
  if (!unitString) return null
  const raw = unitString.toString().toLowerCase().trim()
  if (!raw) return null

  const cleaned = raw.replace(/[.,]/g, ' ')
  const compact = cleaned.replace(/\s+/g, '')

  let token = ''
  const withNumber = compact.match(/^\d+(?:[.,]\d+)?([a-zа-яё]+)/u)
  if (withNumber?.[1]) {
    token = withNumber[1]
  } else {
    const unitAnywhere = cleaned.match(/([a-zа-яё]+)/u)
    token = unitAnywhere?.[1] || ''
  }

  token = token.replace(/[^\p{L}]+/gu, '')
  for (const alias of UNIT_ALIASES) {
    if (alias.re.test(token)) return alias
  }
  return null
}

// Единица, буквально хранящаяся на продукте (например product.unit === 'Г'),
// должна распознаваться как САМА СЕБЯ, а не через defaultUnit/multiplier
// алиаса (иначе "Г" на продукте прочитался бы как "Кг" — тот же алиас,
// который для голосовой фразы "5 г" по умолчанию означает 0.005 Кг).
const normalizeSystemUnit = (value) => {
  const raw = (value || '').toString().trim()
  if (SYSTEM_UNITS.includes(raw)) return raw
  const info = getUnitInfo(raw)
  return info?.defaultUnit && SYSTEM_UNITS.includes(info.defaultUnit) ? info.defaultUnit : null
}

const normalizeName = (value) => {
  const s = (value || '').toString().toLowerCase().trim()
  if (!s) return ''
  return s
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+([.,]\d+)?%?/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokenizeName = (value) => {
  const n = normalizeName(value)
  return n ? n.split(' ').filter(Boolean) : []
}

const isSignificantToken = (token) => token && token.length >= 3 && !STOP_WORDS.has(token)

const getSortedTokenSignature = (tokens) => [...tokens].sort().join('|')

const areTokensSimilar = (a, b) => {
  if (!a || !b) return false
  if (a === b) return true
  const minLen = Math.min(a.length, b.length)
  return minLen >= 4 && (a.startsWith(b) || b.startsWith(a))
}

const getMatchedTokens = (sourceTokens, targetTokens) => {
  const matched = new Set()
  for (const s of sourceTokens) {
    for (const t of targetTokens) {
      if (areTokensSimilar(s, t)) {
        matched.add(s)
        break
      }
    }
  }
  return matched
}

const scoreNameMatch = (queryName, productName) => {
  const qNorm = normalizeName(queryName)
  const pNorm = normalizeName(productName)
  if (!qNorm || !pNorm) return 0
  if (qNorm === pNorm) return 100

  const qTokens = tokenizeName(qNorm)
  const pTokens = tokenizeName(pNorm)
  const qSignature = getSortedTokenSignature(qTokens)
  const pSignature = getSortedTokenSignature(pTokens)
  const qSignificant = qTokens.filter(isSignificantToken)
  const pSignificant = pTokens.filter(isSignificantToken)
  const matchedSignificant = getMatchedTokens(qSignificant, pSignificant)
  const matchedAll = getMatchedTokens(qTokens, pTokens)
  const exactStopWordOverlap = [...matchedAll].filter((t) => STOP_WORDS.has(t)).length

  if (matchedSignificant.size === 0) return 0
  if (matchedSignificant.size === 1) {
    const token = [...matchedSignificant][0]
    if (!token || token.length < 4) return 0
  }

  let score = 0
  if (qSignature && qSignature === pSignature) {
    score = 96
  } else if (pNorm.startsWith(qNorm) || qNorm.startsWith(pNorm)) {
    score = 92
  } else if (pNorm.includes(qNorm) || qNorm.includes(pNorm)) {
    score = 86
  } else if (matchedSignificant.size >= 2) {
    score = 82 + Math.min(10, matchedSignificant.size * 4)
  } else {
    score = 74
  }

  if (matchedSignificant.size === 1 && matchedAll.size === 1) {
    score -= 6
  }
  if (exactStopWordOverlap > 0 && matchedSignificant.size <= 1 && qSignature !== pSignature) {
    score -= 8
  }

  return Math.max(score, 0)
}

const extractMeasurement = (value) => {
  if (!value) return null
  const s = value.toString().trim()
  if (!s) return null
  const match = s.match(MEASUREMENT_RE)
  if (!match) return null

  const rawAmount = parseNumericValue(match[1])
  const unitInfo = getUnitInfo(match[2])
  if (!Number.isFinite(rawAmount) || !unitInfo) return null

  return {
    rawAmount,
    rawUnitText: match[2],
    unitInfo,
    amount: rawAmount * (unitInfo.defaultMultiplier ?? 1),
    unit: unitInfo.defaultUnit
  }
}

const stripMeasurementFromName = (value) => {
  const s = (value || '').toString()
  const cleaned = s.replace(new RegExp(MEASUREMENT_RE.source, 'giu'), ' ').replace(/\s+/g, ' ').trim()
  return cleaned || s.trim()
}

export const parseAiDishResponse = (rawText) => {
  const cleaned = (rawText || '')
    .toString()
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  const nutrition = parsed?.nutrition || {}
  return {
    title: parsed?.title || '',
    description: parsed?.description || '',
    ingredients: Array.isArray(parsed?.ingredients) ? parsed.ingredients : [],
    kcal: parseNumericValue(parsed?.kcal ?? nutrition?.kcal),
    protein: parseNumericValue(parsed?.protein ?? nutrition?.protein),
    fat: parseNumericValue(parsed?.fat ?? nutrition?.fat),
    carbs: parseNumericValue(parsed?.carbs ?? nutrition?.carbs)
  }
}

export const normalizeAiIngredient = (ingredient) => {
  const rawName = typeof ingredient === 'string'
    ? ingredient
    : (ingredient?.name || ingredient?.product || ingredient?.title || 'Неизвестно')

  const explicitAmount = typeof ingredient === 'object' && ingredient !== null
    ? parseNumericValue(ingredient.amount)
    : null

  const unitField = typeof ingredient === 'object' && ingredient !== null
    ? (ingredient.unit || '')
    : ''

  const measurementFromUnit = extractMeasurement([explicitAmount, unitField].filter((v) => v !== null && v !== undefined && v !== '').join(' '))
  const measurementFromName = extractMeasurement(rawName)
  const fallbackUnitInfo = getUnitInfo(unitField) || getUnitInfo(rawName)

  const rawAmount = explicitAmount ?? measurementFromName?.rawAmount ?? measurementFromUnit?.rawAmount ?? 1
  const unitInfo = measurementFromUnit?.unitInfo || measurementFromName?.unitInfo || fallbackUnitInfo || null
  // Предварительная оценка "в лучшем известном виде" — используется, если
  // подобрать продукт не получится (тогда product === null и точный
  // пересчёт делать не от чего). Как только продукт найден, matchIngredientToProduct
  // пересчитает amount/unit точно под его единицу через convertToProductUnit().
  const normalizedAmount = rawAmount * (unitInfo?.defaultMultiplier ?? 1)

  return {
    rawName,
    name: capitalizeDisplayName(stripMeasurementFromName(rawName) || rawName),
    amount: Number.isFinite(normalizedAmount) ? normalizedAmount : 1,
    unit: unitInfo?.defaultUnit || null,
    rawAmount,
    aliasInfo: unitInfo || null,
    rawUnitText: unitField || measurementFromName?.rawUnitText || measurementFromUnit?.rawUnitText || null,
    wasUnitConverted: !!unitInfo && (unitInfo.defaultMultiplier ?? 1) !== 1
  }
}

const getUnitCompatibility = (ingredientUnit, productUnit, rawIngredientUnit = null) => {
  const left = normalizeSystemUnit(ingredientUnit)
  const right = normalizeSystemUnit(productUnit)
  if (left && right) return left === right ? 'compatible' : 'incompatible'
  if (!right) return 'missing'
  if (!left) return rawIngredientUnit ? 'incompatible' : 'missing'
  return 'missing'
}

const isAmountAnomalous = (amount, unit) => {
  const normalizedUnit = normalizeSystemUnit(unit)
  if (!Number.isFinite(amount) || !normalizedUnit) return false
  if ((normalizedUnit === 'Кг' || normalizedUnit === 'Л') && amount >= 2) return true
  if ((normalizedUnit === 'Г' || normalizedUnit === 'Мл') && amount >= 2000) return true
  if (normalizedUnit === 'Шт' && amount >= 30) return true
  return false
}

export const matchIngredientToProduct = (normalizedIngredient, products = []) => {
  const best = (products || []).reduce((acc, product) => {
    if (!product?.name) return acc
    const score = scoreNameMatch(normalizedIngredient.name, product.name)
    if (score <= (acc?.score || 0)) return acc
    return { product, score }
  }, null)

  if (!best || best.score < NAME_MATCH_MIN_SCORE) {
    return {
      ...normalizedIngredient,
      match: null,
      product: null,
      needsAmountCheck: false,
      matchScore: best?.score || 0
    }
  }

  const productUnit = best.product.unit || null

  // Продукт найден — теперь можно точно пересчитать распознанное количество
  // в единицу ИМЕННО ЭТОГО продукта (а не в единицу "по умолчанию" для
  // распознанного алиаса), например "500 г" → 0.5 для курицы в Кг, но 500
  // для соли в Г.
  const preciseAmount = productUnit
    ? convertToProductUnit(normalizedIngredient.aliasInfo, normalizedIngredient.rawAmount, productUnit)
    : null

  const compatibility = preciseAmount !== null
    ? 'compatible'
    : getUnitCompatibility(normalizedIngredient.unit, productUnit, normalizedIngredient.rawUnitText)

  const finalUnit = productUnit || normalizedIngredient.unit || 'Шт'
  const finalAmount = preciseAmount ?? (Number.isFinite(normalizedIngredient.amount) ? normalizedIngredient.amount : 1)
  const hasAnomalousAmount = isAmountAnomalous(finalAmount, finalUnit)
  let amountCheckReason = null
  if (compatibility === 'incompatible') {
    amountCheckReason = 'unit_mismatch'
  } else if (preciseAmount === null && normalizedIngredient.wasUnitConverted) {
    amountCheckReason = 'unit_converted'
  } else if (hasAnomalousAmount) {
    amountCheckReason = 'amount_anomaly'
  }
  const needsAmountCheck = !!amountCheckReason

  return {
    ...normalizedIngredient,
    product: best.product,
    match: best.product,
    matchScore: best.score,
    amount: finalAmount,
    unit: finalUnit,
    needsAmountCheck,
    amountCheckReason
  }
}

export const toFormIngredient = (matchedIngredient) => {
  if (!matchedIngredient?.product?.id) {
    return {
      product: null,
      name: capitalizeDisplayName(matchedIngredient?.name || matchedIngredient?.rawName || 'Неизвестно'),
      amount: Number.isFinite(matchedIngredient?.amount) ? matchedIngredient.amount : 1,
      unit: matchedIngredient?.unit || matchedIngredient?.rawUnitText || 'Шт',
      needsAmountCheck: false,
      amountCheckReason: null
    }
  }

  return {
    product: matchedIngredient.product.id,
    name: matchedIngredient.product.name || matchedIngredient.name || 'Неизвестно',
    amount: Number.isFinite(matchedIngredient.amount) ? matchedIngredient.amount : 1,
    unit: matchedIngredient.product.unit || matchedIngredient.unit || 'Шт',
    needsAmountCheck: !!matchedIngredient.needsAmountCheck,
    amountCheckReason: matchedIngredient.amountCheckReason || null
  }
}
