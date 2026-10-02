// Движок подсказок для планирования. Чистые функции без обращений к сети:
// всё считается по уже загруженным блюдам и плану, поэтому мгновенно.
//
// Идея: каждое подходящее блюдо получает баллы по понятным правилам
// (остатки заготовок, продукты из списка покупок, разнообразие, привычки),
// а к каждому баллу прикладывается человеческое объяснение — оно
// показывается пользователю под предложением.

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

// --- Вычисляемые признаки (считаются из КБЖУ, пользователь их не ставит) ---
export const LOW_KCAL_MAX = 400 // ккал на порцию
export const HIGH_PROTEIN_MIN = 25 // г белка на порцию

export const AUTO_TAGS = [
  { id: 'auto:low_kcal', name: 'Мало калорий', test: (d) => Number(d.kcal) > 0 && Number(d.kcal) <= LOW_KCAL_MAX },
  { id: 'auto:high_protein', name: 'Много белка', test: (d) => Number(d.protein) >= HIGH_PROTEIN_MIN }
]

export const getAutoTags = (dish) => AUTO_TAGS.filter((t) => t.test(dish))

export const isAutoTagId = (id) => typeof id === 'string' && id.startsWith('auto:')

export const dishHasTag = (dish, tagId) => {
  const auto = AUTO_TAGS.find((t) => t.id === tagId)
  if (auto) return auto.test(dish)
  return (dish.tags || []).includes(tagId)
}

// --- Фильтры подсказок (чипы) ---
export const SUGGESTION_FILTERS = [
  { id: 'shopping', name: 'Из списка покупок' },
  { id: 'auto:low_kcal', name: 'До 400 ккал' },
  { id: 'auto:high_protein', name: 'Белка от 25 г' },
  { id: 'long_ago', name: 'Давно не было' }
]

const LONG_AGO_DAYS = 14
const HISTORY_DAYS = 90

// --- Склонения для объяснений ---
const plural = (n, one, few, many) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const toDateStr = (d) => (typeof d === 'string' ? d.slice(0, 10) : format(d, 'yyyy-MM-dd'))
const daysBetween = (a, b) => differenceInCalendarDays(parseISO(a), parseISO(b))

// Совпадение продуктов имеет смысл только для скоропортящегося: соль, масло,
// крупы и соусы есть дома всегда, общая пачка соли — не причина выбрать блюдо.
// Та же идея, что у Mealime: подбирать блюда, которые доиспользуют остаток
// купленного под другие блюда недели (полкочана капусты, пучок зелени).
const PERISHABLE_CATEGORIES = new Set(['Овощи и фрукты', 'Молочные продукты', 'Мясо, птица, рыба', 'Хлеб'])
const PROTEIN_CATEGORY = 'Мясо, птица, рыба'
// Остатки заготовки предлагаем доесть, только пока они свежие
const LEFTOVER_FRESH_DAYS = 3

const ingredientProducts = (dish) => {
  const seen = new Set()
  const out = []
  for (const ing of dish?.ingredients || []) {
    if (!ing.product || seen.has(ing.product)) continue
    seen.add(ing.product)
    out.push({ id: ing.product, name: ing.productData?.name || ing.name || '', category: ing.productData?.category || '' })
  }
  return out
}
const perishableOf = (dish) => ingredientProducts(dish).filter((p) => PERISHABLE_CATEGORIES.has(p.category))
// Основной белок блюда (курица, фарш, рыба...) — для разнообразия по дням. Яйца не считаем.
const mainProteinOf = (dish) =>
  ingredientProducts(dish).find((p) => p.category === PROTEIN_CATEGORY && !/яйц/i.test(p.name))?.id || null

/**
 * Контекст для оценки: всё, что зависит от плана, считаем один раз.
 * planItems — записи плана ({ dish, product, productData?, date, meal_type, portions, ignore_shopping }).
 *
 * Важно про время:
 * - для ПОКУПОК учитываем только дни с сегодняшнего и до конца периода —
 *   продукты под прошедшие дни уже куплены и съедены;
 * - для РАЗНООБРАЗИЯ учитываем и прошлое — "ели в понедельник" важно.
 */
export const buildContext = ({ planItems, dishes, periodStart, periodLength, today = new Date() }) => {
  const dishById = new Map(dishes.map((d) => [d.id, d]))
  const startStr = toDateStr(periodStart)
  const endStr = toDateStr(addDays(parseISO(startStr), (periodLength || 7) - 1))
  const todayStr = toDateStr(today)
  const historyFromStr = toDateStr(addDays(parseISO(todayStr), -HISTORY_DAYS))

  // productId -> Map(dishId | 'manual' -> isDraft): что будет куплено и для чего.
  // isDraft = блюдо пока только в идеях (не в плане) — это влияет на формулировку.
  const upcomingProducts = new Map()
  const datesByDish = new Map() // dishId -> [dateStr] (вся история и будущее)
  const usesByDish = new Map() // dishId -> [{ date, portions }] в периоде (для остатков заготовок)
  const proteinByDate = new Map() // dateStr -> Set(productId) основного белка
  const slotFrequency = new Map() // `${dishId}|${mealType}` -> count (история)

  const addUpcoming = (productId, owner, isDraft = false) => {
    if (!upcomingProducts.has(productId)) upcomingProducts.set(productId, new Map())
    const owners = upcomingProducts.get(productId)
    owners.set(owner, owners.has(owner) ? owners.get(owner) && isDraft : isDraft)
  }

  for (const item of planItems) {
    const date = toDateStr(item.date || '')
    if (!date) continue
    const inPeriod = date >= startStr && date <= endStr
    const upcoming = inPeriod && date >= todayStr && !item.ignore_shopping

    if (item.product) {
      if (upcoming && PERISHABLE_CATEGORIES.has(item.productData?.category)) addUpcoming(item.product, 'manual')
      continue
    }
    if (!item.dish) continue
    const dish = dishById.get(item.dish)

    if (!datesByDish.has(item.dish)) datesByDish.set(item.dish, [])
    datesByDish.get(item.dish).push(date)

    if (date < todayStr && date >= historyFromStr) {
      const key = `${item.dish}|${item.meal_type}`
      slotFrequency.set(key, (slotFrequency.get(key) || 0) + 1)
    }

    if (inPeriod) {
      if (!usesByDish.has(item.dish)) usesByDish.set(item.dish, [])
      usesByDish.get(item.dish).push({ date, portions: Number(item.portions) || 1 })
      const protein = mainProteinOf(dish)
      if (protein) {
        if (!proteinByDate.has(date)) proteinByDate.set(date, new Set())
        proteinByDate.get(date).add(protein)
      }
    }
    if (upcoming) {
      for (const p of perishableOf(dish)) addUpcoming(p.id, item.dish, !!item.draft)
    }
  }

  return { dishById, startStr, endStr, todayStr, upcomingProducts, datesByDish, usesByDish, proteinByDate, slotFrequency }
}

// Остаток заготовки на конкретный день: порции из последней готовки,
// приготовленной не позже этого дня и не раньше чем LEFTOVER_FRESH_DAYS назад.
const leftoverFor = (dish, ctx, dateStr) => {
  const yieldAmount = Number(dish.batch_yield) || 1
  if (yieldAmount <= 1) return null
  const uses = (ctx.usesByDish.get(dish.id) || []).filter((u) => u.date <= dateStr)
  if (!uses.length) return null
  const used = uses.reduce((sum, u) => sum + u.portions, 0)
  const remaining = Math.ceil(used / yieldAmount) * yieldAmount - used
  const lastUse = uses.reduce((max, u) => (u.date > max ? u.date : max), uses[0].date)
  return remaining > 0 && daysBetween(dateStr, lastUse) <= LEFTOVER_FRESH_DAYS ? { remaining, cookedOn: lastUse } : null
}

// "Морковь", "Морковь и лук", "Морковь, лук и ещё 2" — с заглавной, для начала фразы
const listNames = (names) => {
  const lower = names.map((n) => n.toLowerCase())
  let text
  if (lower.length === 1) text = lower[0]
  else if (lower.length === 2) text = `${lower[0]} и ${lower[1]}`
  else text = `${lower.slice(0, 2).join(', ')} и ещё ${lower.length - 2}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const WEEKDAY_GENITIVE = ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы']
const sinceDay = (cookedOn, dateStr) => {
  const diff = daysBetween(dateStr, cookedOn)
  if (diff === 0) return 'с этого же дня'
  if (diff === 1) return 'со вчера'
  const day = parseISO(cookedOn).getDay()
  return `${day === 2 ? 'со' : 'с'} ${WEEKDAY_GENITIVE[day]}`
}

// Короткий список для метки: "морковь +2" — длинные названия не влезают
const shortNames = (names) => {
  const lower = names.map((n) => n.toLowerCase())
  return lower.length > 1 ? `${lower[0]} +${lower.length - 1}` : lower[0] || ''
}

// Фраза про общие продукты. Называем блюдо, ради которого продукт покупается:
// - оно уже в плане → "Морковь и лук уже в списке покупок — для «Щи»";
// - оно пока только в этих идеях → "Морковь пригодится и для «Щи» выше";
// - продукт добавлен в план отдельно → "Морковь уже в списке покупок".
const sharedReason = (dish, sharedProducts, ctx) => {
  const names = listNames(sharedProducts.map((p) => p.name))
  const realCount = new Map()
  const draftCount = new Map()
  let manual = false
  for (const p of sharedProducts) {
    for (const [owner, isDraft] of ctx.upcomingProducts.get(p.id) || []) {
      if (owner === dish.id) continue
      if (owner === 'manual') { manual = true; continue }
      const bucket = isDraft ? draftCount : realCount
      bucket.set(owner, (bucket.get(owner) || 0) + 1)
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const nameOf = (id) => ctx.dishById.get(id)?.name || ''
  const realOwner = top(realCount)
  if (realOwner) {
    const others = realCount.size - 1
    return `${names} уже в списке покупок — для «${nameOf(realOwner)}»${others > 0 ? ' и других блюд' : ''}`
  }
  const draftOwner = top(draftCount)
  if (draftOwner) {
    const verb = sharedProducts.length === 1 ? 'пригодится' : 'пригодятся'
    return `${names} ${verb} и для «${nameOf(draftOwner)}» выше — купите один раз`
  }
  return manual ? `${names} уже в списке покупок` : names
}

/**
 * Баллы и объяснения для одного блюда в конкретный день и приём пищи.
 * Причины собираются с весом, пользователю показываем 2 самые важные.
 * У каждой причины есть полная фраза (text) и короткая метка с иконкой
 * (short, icon) — для компактных карточек; самая важная метка = badge.
 */
export const scoreDish = (dish, ctx, { date, mealTypeId, mealTypeName = '' }) => {
  const dateStr = toDateStr(date)
  const reasons = [] // { weight, text, short, icon }
  let score = 0

  // 1. Остатки свежей заготовки — сначала доесть
  const leftoverInfo = leftoverFor(dish, ctx, dateStr)
  const leftover = leftoverInfo?.remaining || 0
  if (leftover > 0) {
    score += 6
    reasons.push({
      weight: 10,
      text: `Осталось ${leftover} ${plural(leftover, 'порция', 'порции', 'порций')} ${sinceDay(leftoverInfo.cookedOn, dateStr)} — можно доесть`,
      short: `доесть ${leftover} ${plural(leftover, 'порцию', 'порции', 'порций')}`,
      icon: 'kitchen'
    })
  }

  // Основной белок и есть ли он уже в этот / соседний день
  const protein = mainProteinOf(dish)
  const proteinOn = (shift) => ctx.proteinByDate.get(toDateStr(addDays(parseISO(dateStr), shift)))?.has(protein)
  const proteinSameDay = !!protein && proteinOn(0)
  const proteinAdjacent = !!protein && (proteinOn(-1) || proteinOn(1))

  // 2. Общие скоропортящиеся продукты с блюдами, которые ещё будут приготовлены.
  // Тот же белок в тот же или соседний день общим продуктом не считаем —
  // одна пачка курицы не повод есть курицу дважды подряд.
  const perishable = perishableOf(dish)
  const sharedProducts = perishable
    .filter((p) => !(p.id === protein && (proteinSameDay || proteinAdjacent) && leftover === 0))
    .filter((p) => [...(ctx.upcomingProducts.get(p.id)?.keys() || [])].some((owner) => owner !== dish.id))
  const sharedNames = sharedProducts.map((p) => p.name)
  if (sharedNames.length) {
    score += 3 * (sharedNames.length / perishable.length) + Math.min(sharedNames.length, 3) * 0.6
    reasons.push({ weight: 8, text: sharedReason(dish, sharedProducts, ctx), short: shortNames(sharedNames), icon: 'shopping_cart' })
  }

  // 3. Разнообразие: ближайшее появление этого блюда (прошлое и будущее)
  const dates = ctx.datesByDish.get(dish.id) || []
  if (leftover === 0) {
    let nearest = Infinity
    for (const d of dates) nearest = Math.min(nearest, Math.abs(daysBetween(d, dateStr)))
    if (nearest === 0) score -= 8
    else if (nearest === 1) score -= 5
    else if (nearest <= 3) score -= 2
    // Уже стоит в этом периоде — не повторяем без нужды
    score -= 1.5 * dates.filter((d) => d >= ctx.startStr && d <= ctx.endStr).length
  } else if (dates.includes(dateStr)) {
    score -= 5 // доедать лучше не в тот же день
  }

  // 4. Разнообразие по основному белку: не курица на обед и ужин подряд
  if (leftover === 0) {
    if (proteinSameDay) score -= 3
    else if (proteinAdjacent) score -= 1.5
  }

  // 5. Давно не готовили / ещё ни разу
  const past = dates.filter((d) => d < dateStr).sort()
  const lastPast = past[past.length - 1]
  const daysSince = lastPast ? daysBetween(dateStr, lastPast) : null
  if (!dates.length) {
    score += 0.5
    reasons.push({ weight: 2, text: 'Ещё ни разу не было в плане', short: 'ещё не готовили', icon: 'fiber_new' })
  } else if (daysSince !== null && daysSince >= LONG_AGO_DAYS) {
    score += 1.5
    reasons.push({ weight: 3, text: `Не было в плане ${daysSince} ${plural(daysSince, 'день', 'дня', 'дней')}`, short: `не было ${daysSince} ${plural(daysSince, 'день', 'дня', 'дней')}`, icon: 'schedule' })
  }

  // 6. Привычка: как часто выбирали именно на этот приём пищи
  const freq = ctx.slotFrequency.get(`${dish.id}|${mealTypeId}`) || 0
  if (freq > 0) {
    score += Math.min(freq, 5) * 0.3
    if (freq >= 3) {
      const slot = mealTypeName ? ` на ${mealTypeName.toLowerCase()}` : ''
      reasons.push({ weight: 4, text: `Часто выбираете${slot}`, short: `часто${slot}`, icon: 'favorite_border' })
    }
  }

  // «Ещё ни разу не было в плане» — слабая причина: показываем, только если других нет
  const hasStrong = reasons.some((r) => r.weight >= 3)
  const top = reasons
    .filter((r) => !hasStrong || r.weight >= 3)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
  const badge = top[0] ? { short: top[0].short, icon: top[0].icon } : null
  return { dish, score, reasons: top.map((r) => r.text), badge, shared: sharedNames.length, daysSince, leftover, everPlanned: dates.length > 0 }
}

const passesFilters = (result, filters) => {
  for (const f of filters) {
    if (f === 'shopping' && !(result.shared > 0 || result.leftover > 0)) return false
    if (f === 'long_ago' && !(!result.everPlanned || (result.daysSince !== null && result.daysSince >= LONG_AGO_DAYS))) return false
    if (f !== 'shopping' && f !== 'long_ago' && !dishHasTag(result.dish, f)) return false
  }
  return true
}

// Небольшой детерминированный "шум", чтобы "Пересобрать" давало другой вариант
const jitter = (seed, id) => {
  if (!seed) return 0
  let h = seed
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 1000) / 1000 * 1.5
}

/**
 * Отсортированные предложения для слота.
 * excludeDishIds — уже стоящие в этом слоте; garnishTypeId — гарниры не
 * предлагаем как самостоятельное блюдо (они подбираются к горячему отдельно).
 * dishTypeId — только блюда этого вида ("заполнить салаты на неделю").
 */
export const rankDishes = (ctx, dishes, { date, mealTypeId, mealTypeName = '', filters = [], excludeDishIds = [], garnishTypeId = null, onlyGarnish = false, dishTypeId = null, seed = 0 }) => {
  const exclude = new Set(excludeDishIds)
  // Выбрали вид «Гарнир» — гарниры предлагаем как обычные блюда
  if (dishTypeId && dishTypeId === garnishTypeId) onlyGarnish = true
  return dishes
    .filter((d) => !exclude.has(d.id))
    .filter((d) => !dishTypeId || d.dish_type === dishTypeId)
    .filter((d) => (onlyGarnish ? d.dish_type === garnishTypeId : d.dish_type !== garnishTypeId || !garnishTypeId))
    .filter((d) => onlyGarnish || (d.meal_type || []).includes(mealTypeId))
    .map((d) => scoreDish(d, ctx, { date, mealTypeId, mealTypeName }))
    .filter((r) => passesFilters(r, filters))
    .map((r) => ({ ...r, rank: r.score + jitter(seed, r.dish.id) }))
    .sort((a, b) => b.rank - a.rank || a.dish.name.localeCompare(b.dish.name))
}

/**
 * Черновик плана на период: заполняет пустые слоты по одному, каждый раз
 * пересчитывая контекст с учётом уже выбранного (так блюда делят продукты,
 * заготовки доедаются, а одно и то же не повторяется подряд).
 *
 * Без dishTypeId заполняются только пустые приёмы пищи. С dishTypeId (например,
 * «Салат») — приёмы пищи, где ещё нет блюда этого вида: салат добавится к
 * обеду, в котором уже стоит борщ.
 *
 * Возвращает [{ key, date, mealTypeId, dishId, garnishId, reasons, badge }].
 */
export const buildWeekDraft = ({
  planItems, dishes, periodStart, periodLength, mealTypeIds, filters = [],
  garnishTypeId = null, dishTypeId = null, portions = 1, seed = 0, today = new Date(), fromDate = null, mealTypeNames = {}
}) => {
  const simulated = planItems.map((p) => ({
    dish: p.dish, product: p.product, date: toDateStr(p.date || ''), meal_type: p.meal_type,
    portions: p.portions, ignore_shopping: p.ignore_shopping
  }))
  const typeOf = new Map(dishes.map((d) => [d.id, d.dish_type]))
  const occupied = new Set(simulated
    .filter((p) => (dishTypeId ? p.dish && typeOf.get(p.dish) === dishTypeId : p.dish || p.product))
    .map((p) => `${p.date}|${p.meal_type}`))
  // Блюда, уже стоящие в слоте, — их не предлагаем повторно
  const inSlot = (dateStr, mealTypeId) => simulated
    .filter((p) => p.dish && p.date === dateStr && p.meal_type === mealTypeId)
    .map((p) => p.dish)
  // Гарнир к блюду подбираем, если не заполняем сами гарниры
  const pairGarnish = garnishTypeId && dishTypeId !== garnishTypeId
  const draft = []
  const startStr = toDateStr(periodStart)
  const minDate = fromDate ? toDateStr(fromDate) : null

  for (let i = 0; i < (periodLength || 7); i++) {
    const dateStr = toDateStr(addDays(parseISO(startStr), i))
    if (minDate && dateStr < minDate) continue
    for (const mealTypeId of mealTypeIds) {
      if (occupied.has(`${dateStr}|${mealTypeId}`)) continue
      const ctx = buildContext({ planItems: simulated, dishes, periodStart: startStr, periodLength, today })
      const ranked = rankDishes(ctx, dishes, {
        date: dateStr, mealTypeId, mealTypeName: mealTypeNames[mealTypeId], filters, garnishTypeId, dishTypeId,
        excludeDishIds: inSlot(dateStr, mealTypeId), seed
      })
      if (!ranked.length) continue
      const pick = ranked[0]

      let garnish = null
      if (pick.dish.needs_side_dish && pairGarnish) {
        garnish = rankDishes(ctx, dishes, { date: dateStr, mealTypeId, garnishTypeId, onlyGarnish: true, seed })[0] || null
      }

      const entry = {
        key: `${dateStr}|${mealTypeId}`,
        date: dateStr,
        mealTypeId,
        dishId: pick.dish.id,
        garnishId: garnish?.dish.id || null,
        reasons: pick.reasons,
        badge: pick.badge
      }
      draft.push(entry)
      simulated.push({ dish: pick.dish.id, date: dateStr, meal_type: mealTypeId, portions, ignore_shopping: false, draft: true })
      if (garnish) simulated.push({ dish: garnish.dish.id, date: dateStr, meal_type: mealTypeId, portions, ignore_shopping: false, draft: true })
    }
  }
  return draft
}

/**
 * Замена одного блюда в черновике: следующий по рейтингу вариант для этого
 * слота с учётом остального черновика (без самого заменяемого слота).
 */
export const nextAlternative = ({
  planItems, draft, entry, dishes, periodStart, periodLength, filters = [], garnishTypeId = null,
  dishTypeId = null, portions = 1, tried = [], today = new Date(), mealTypeNames = {}
}) => {
  const others = draft.filter((d) => d.key !== entry.key)
  const simulated = [
    ...planItems,
    ...others.flatMap((d) => [
      { dish: d.dishId, date: d.date, meal_type: d.mealTypeId, portions, draft: true },
      ...(d.garnishId ? [{ dish: d.garnishId, date: d.date, meal_type: d.mealTypeId, portions, draft: true }] : [])
    ])
  ]
  const ctx = buildContext({ planItems: simulated, dishes, periodStart, periodLength, today })
  const alreadyInSlot = planItems
    .filter((p) => p.dish && toDateStr(p.date || '') === entry.date && p.meal_type === entry.mealTypeId)
    .map((p) => p.dish)
  const ranked = rankDishes(ctx, dishes, {
    date: entry.date, mealTypeId: entry.mealTypeId, mealTypeName: mealTypeNames[entry.mealTypeId], filters, garnishTypeId, dishTypeId,
    excludeDishIds: [...tried, ...alreadyInSlot]
  })
  const pick = ranked[0]
  if (!pick) return null
  let garnish = null
  if (pick.dish.needs_side_dish && garnishTypeId && dishTypeId !== garnishTypeId) {
    garnish = rankDishes(ctx, dishes, { date: entry.date, mealTypeId: entry.mealTypeId, garnishTypeId, onlyGarnish: true })[0] || null
  }
  return { ...entry, dishId: pick.dish.id, garnishId: garnish?.dish.id || null, reasons: pick.reasons, badge: pick.badge }
}
