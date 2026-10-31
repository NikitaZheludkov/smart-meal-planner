import { formatUnit } from './utils'

// Все блюда семьи читаемым текстом — чтобы скопировать в заметки или
// переслать. Группируем по виду блюда в порядке справочника. Что войдёт
// в текст, выбирает пользователь (include); без деталей — просто список:
//
// ГОРЯЧЕЕ · 12
//
// Сырники
// Завтрак · 2 порции · 350 ккал, Б 20, Ж 15, У 30 · #Выходного дня
// - Творог 400 г
// - Яйцо куриное 1 шт

export const EXPORT_OPTIONS = [
  { id: 'meta', label: 'Приём пищи и порции' },
  { id: 'nutrition', label: 'КБЖУ' },
  { id: 'tags', label: 'Теги' },
  { id: 'ingredients', label: 'Составы' },
  { id: 'description', label: 'Описание' }
]

const formatAmount = (amount) => {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

const pluralPortions = (n) => {
  if (n % 10 === 1 && n % 100 !== 11) return 'порция'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'порции'
  return 'порций'
}

const formatNutrition = (dish) => {
  const kcal = Number(dish.kcal)
  if (!kcal) return ''
  const macro = (label, value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? `, ${label} ${Math.round(Number(value))}` : '')
  return `${Math.round(kcal)} ккал${macro('Б', dish.protein)}${macro('Ж', dish.fat)}${macro('У', dish.carbs)}`
}

const formatDish = (dish, { mealTypeNames, tagName, include }) => {
  const portions = Number(dish.batch_yield) || 1
  const meta = [
    include.meta ? mealTypeNames(dish.meal_type).join(', ') : '',
    include.meta ? `${portions} ${pluralPortions(portions)}` : '',
    include.nutrition ? formatNutrition(dish) : '',
    include.meta && dish.needs_side_dish ? 'с гарниром' : '',
    include.tags ? (dish.tags || []).map(tagName).filter(Boolean).map((n) => '#' + n).join(' ') : ''
  ].filter(Boolean)

  const name = dish.name.trim()
  // Без составов и описания — одна строка на блюдо: «Плов — 450 ккал, …»
  if (!include.ingredients && !include.description) {
    return meta.length ? `${name} — ${meta.join(' · ')}` : name
  }

  const lines = [name]
  if (meta.length) lines.push(meta.join(' · '))
  if (include.ingredients) {
    const ingredients = [...(dish.ingredients || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
    for (const ing of ingredients) {
      lines.push(`- ${(ing.name || '').trim()} ${formatAmount(ing.amount)} ${formatUnit(ing.unit)}`.trimEnd())
    }
  }
  const description = include.description ? (dish.description || '').trim() : ''
  if (description) lines.push(description)
  return lines.join('\n')
}

export const dishesToText = (dishes, { dishTypes, mealTypeNames, tagName, include = {} }) => {
  const byType = new Map()
  for (const dish of dishes) {
    const key = dish.dish_type || ''
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key).push(dish)
  }

  const groups = [
    ...dishTypes.map((t) => ({ title: t.name, dishes: byType.get(t.id) || [] })),
    { title: 'Без вида', dishes: [...byType.entries()].filter(([id]) => !dishTypes.some((t) => t.id === id)).flatMap(([, list]) => list) }
  ].filter((g) => g.dishes.length)

  // Одни названия — плотным списком; с деталями — блюда через пустую строку
  const rendered = groups.map((g) => {
    const sorted = [...g.dishes].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    return { title: `${g.title.toUpperCase()} · ${sorted.length}`, blocks: sorted.map((d) => formatDish(d, { mealTypeNames, tagName, include })) }
  })
  const compact = rendered.every((g) => g.blocks.every((b) => !b.includes('\n')))
  const sep = compact ? '\n' : '\n\n'
  return rendered.map((g) => [g.title, ...g.blocks].join(sep)).join(compact ? '\n\n' : '\n\n\n')
}
