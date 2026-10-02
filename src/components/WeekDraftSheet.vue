<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { format, parseISO, isBefore, startOfDay, addDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import { usePlanStore } from '../stores/plan'
import { useDishStore } from '../stores/dishes'
import { useDictionariesStore } from '../stores/dictionaries'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { usePlatformStore } from '../stores/platform'
import { buildWeekDraft, nextAlternative, SUGGESTION_FILTERS } from '../lib/suggestions'
import CollapseTransition from './CollapseTransition.vue'

// "Идеи на неделю": окно выглядит как сама неделя плана. Уже запланированное
// показано бледно (для контекста), пустые места заполнены предложениями в
// пунктирных карточках. Пользователь добавляет понравившиеся по одному (+),
// заменяет вариант (↻) или добавляет все сразу.
const props = defineProps({
  isOpen: Boolean,
  periodStart: [Date, String]
})
const emit = defineEmits(['close'])

const planStore = usePlanStore()
const dishStore = useDishStore()
const dictionaries = useDictionariesStore()
const settingsStore = useSettingsStore()
const ui = useUIStore()
const platform = usePlatformStore()

const modalRegistryId = `week-draft-${Math.random().toString(36).slice(2)}`
watch(() => props.isOpen, (open) => ui.syncModalState(modalRegistryId, open), { immediate: true })
onUnmounted(() => ui.clearModalState(modalRegistryId))

const periodLength = computed(() => settingsStore.periodLength || 7)
const portions = computed(() => Number(settingsStore.defaultPortions) || 1)
const garnishTypeId = computed(() => dictionaries.dishTypes.find((t) => t.name === 'Гарнир')?.id || null)
const dishById = computed(() => new Map(dishStore.dishes.map((d) => [d.id, d])))
const mealTypeNames = computed(() => Object.fromEntries(dictionaries.mealTypes.map((m) => [m.id, m.name])))

// Настройки подбора. Перекус по умолчанию не заполняем — его чаще решают на ходу.
const selectedMealTypes = ref([])
const filters = ref([])
// Вид блюда: null — любые (заполняем пустые приёмы пищи), иначе только этот
// вид — например, салаты на всю неделю, в том числе к уже запланированному
const dishTypeId = ref(null)
const showFilters = ref(false)
const seed = ref(0)
const draft = ref([])
const tried = ref({}) // key -> [dishId, ...] уже показанные варианты для слота
const added = ref(new Map()) // ключ слота -> [id записей плана], уже добавленные
const expanded = ref(new Set()) // карточки, у которых раскрыто объяснение
const addingKey = ref('')
const draftVersion = ref(0) // ключ для анимации смены всей подборки

const filterOptions = computed(() => [
  ...SUGGESTION_FILTERS.filter((f) => f.id !== 'long_ago'),
  ...(dictionaries.availableTags || []).map((t) => ({ id: t.id, name: t.name }))
])

const toDateStr = (d) => format(d, 'yyyy-MM-dd')

// Прошедшие дни периода не трогаем
const fromDate = computed(() => {
  const start = startOfDay(new Date(props.periodStart))
  const today = startOfDay(new Date())
  return isBefore(start, today) ? today : start
})
const periodEnd = computed(() => addDays(startOfDay(new Date(props.periodStart)), periodLength.value - 1))
const periodLabel = computed(() => {
  const from = fromDate.value
  const to = periodEnd.value
  if (isBefore(to, from)) return ''
  return from.getMonth() === to.getMonth()
    ? `${format(from, 'd')}–${format(to, 'd MMMM', { locale: ru })}`
    : `${format(from, 'd MMM', { locale: ru })} – ${format(to, 'd MMM', { locale: ru })}`
})

const rebuild = () => {
  if (!props.isOpen) return
  const orderedSlots = dictionaries.mealTypes.map((m) => m.id).filter((id) => selectedMealTypes.value.includes(id))
  draft.value = buildWeekDraft({
    planItems: planStore.plan,
    dishes: dishStore.dishes,
    periodStart: props.periodStart,
    periodLength: periodLength.value,
    mealTypeIds: orderedSlots,
    filters: filters.value,
    garnishTypeId: garnishTypeId.value,
    dishTypeId: dishTypeId.value,
    portions: portions.value,
    seed: seed.value,
    fromDate: fromDate.value,
    mealTypeNames: mealTypeNames.value
  })
  tried.value = Object.fromEntries(draft.value.map((e) => [e.key, [e.dishId]]))
  added.value = new Map()
  expanded.value = new Set()
  draftVersion.value++
}

watch(() => props.isOpen, (open) => {
  if (!open) return
  selectedMealTypes.value = dictionaries.mealTypes.filter((m) => m.name !== 'Перекус').map((m) => m.id)
  filters.value = []
  dishTypeId.value = null
  showFilters.value = false
  seed.value = 0
  rebuild()
}, { immediate: true })

const toggleMealType = (id) => {
  platform.haptic.selection()
  const list = selectedMealTypes.value
  selectedMealTypes.value = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  rebuild()
}
const selectDishType = (id) => {
  if (dishTypeId.value === id) return
  platform.haptic.selection()
  dishTypeId.value = id
  rebuild()
}
const dishTypeName = computed(() => dictionaries.dishTypes.find((t) => t.id === dishTypeId.value)?.name || '')

const toggleFilter = (id) => {
  platform.haptic.selection()
  filters.value = filters.value.includes(id) ? filters.value.filter((x) => x !== id) : [...filters.value, id]
  rebuild()
}
const toggleFiltersPanel = () => {
  platform.haptic.selection()
  showFilters.value = !showFilters.value
}
const reshuffle = () => {
  platform.haptic.impact('light')
  seed.value = Math.floor(Math.random() * 1e9) + 1
  rebuild()
}
const toggleExpanded = (key) => {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

const replaceEntry = (entry) => {
  platform.haptic.selection()
  const seen = tried.value[entry.key] || [entry.dishId]
  let next = nextAlternative({
    planItems: planStore.plan, draft: draft.value, entry, dishes: dishStore.dishes,
    periodStart: props.periodStart, periodLength: periodLength.value, filters: filters.value,
    garnishTypeId: garnishTypeId.value, dishTypeId: dishTypeId.value, portions: portions.value, tried: seen, mealTypeNames: mealTypeNames.value
  })
  if (!next) {
    // Варианты закончились — начинаем круг заново
    next = nextAlternative({
      planItems: planStore.plan, draft: draft.value, entry, dishes: dishStore.dishes,
      periodStart: props.periodStart, periodLength: periodLength.value, filters: filters.value,
      garnishTypeId: garnishTypeId.value, dishTypeId: dishTypeId.value, portions: portions.value, tried: [entry.dishId], mealTypeNames: mealTypeNames.value
    })
    tried.value[entry.key] = []
  }
  if (!next) {
    ui.showToast('Других вариантов нет', 'info')
    return
  }
  tried.value[entry.key] = [...(tried.value[entry.key] || []), next.dishId]
  draft.value = draft.value.map((e) => (e.key === entry.key ? next : e))
}

const removeGarnish = (entry) => {
  platform.haptic.selection()
  draft.value = draft.value.map((e) => (e.key === entry.key ? { ...e, garnishId: null } : e))
}

const remaining = computed(() => draft.value.filter((e) => !added.value.has(e.key)))

// --- Калорийность ---
// Ккал в карточках — на одну порцию (на одного человека), как в карточке блюда
const entryKcal = (entry) => {
  const dish = dishById.value.get(entry.dishId)
  const garnish = entry.garnishId ? dishById.value.get(entry.garnishId) : null
  if (!dish?.kcal) return 0
  return Number(dish.kcal) + (garnish ? Number(garnish.kcal) || 0 : 0)
}

// Ккал за день: то, что уже в плане, + ещё не добавленные предложения.
// Если у части блюд калорийность не заполнена — "~1 720+"; если неизвестна
// больше чем у половины блюд — не показываем вовсе.
const dayKcal = (dateStr) => {
  let sum = 0
  let known = 0
  let unknown = 0
  const count = (kcal) => {
    if (kcal > 0) { sum += kcal; known++ } else unknown++
  }
  for (const item of planStore.plan) {
    if (!item.dish || String(item.date).slice(0, 10) !== dateStr) continue
    count(Number(dishById.value.get(item.dish)?.kcal) || 0)
  }
  for (const entry of remaining.value) {
    if (entry.date !== dateStr) continue
    count(Number(dishById.value.get(entry.dishId)?.kcal) || 0)
    if (entry.garnishId) count(Number(dishById.value.get(entry.garnishId)?.kcal) || 0)
  }
  if (!known || unknown > (known + unknown) / 2) return null
  return { value: Math.round(sum), partial: unknown > 0 }
}
const formatKcal = (k) => (k ? `~${k.value.toLocaleString('ru-RU')}${k.partial ? '+' : ''}` : '')

// --- Дни: все выбранные приёмы пищи, с планом и предложениями ---
const days = computed(() => {
  const slots = dictionaries.mealTypes.filter((m) => selectedMealTypes.value.includes(m.id))
  if (!slots.length) return []
  const entryByKey = new Map(draft.value.map((e) => [e.key, e]))
  const result = []
  for (let d = fromDate.value; !isBefore(periodEnd.value, d); d = addDays(d, 1)) {
    const dateStr = toDateStr(d)
    const rows = slots.map((slot) => {
      const entry = entryByKey.get(`${dateStr}|${slot.id}`) || null
      const planned = planStore.plan
        .filter((p) => String(p.date).slice(0, 10) === dateStr && p.meal_type === slot.id)
        .map((p) => p.dishData?.name || p.productData?.name)
        .filter(Boolean)
      return { slot, entry, planned }
    })
    result.push({
      date: dateStr,
      label: format(d, 'EEEEEE, d MMMM', { locale: ru }),
      kcal: dayKcal(dateStr),
      rows
    })
  }
  return result
})

// --- Добавление в план ---
const addEntryToPlan = async (entry) => {
  const ids = []
  for (const dishId of [entry.dishId, entry.garnishId].filter(Boolean)) {
    const dish = dishById.value.get(dishId)
    if (!dish) continue
    const id = await planStore.addToPlan(entry.date, entry.mealTypeId, { ...dish, type: 'dish', portions: portions.value })
    if (id) ids.push(id)
  }
  if (ids.length) added.value = new Map(added.value).set(entry.key, ids)
}

// Отмена добавления (на случай случайного нажатия)
const undoEntry = async (entry) => {
  if (addingKey.value) return
  platform.haptic.selection()
  addingKey.value = entry.key
  try {
    for (const id of added.value.get(entry.key) || []) await planStore.removeFromPlan(id)
    const next = new Map(added.value)
    next.delete(entry.key)
    added.value = next
  } finally {
    addingKey.value = ''
  }
}

const addEntry = async (entry) => {
  if (addingKey.value || added.value.has(entry.key)) return
  platform.haptic.impact('light')
  addingKey.value = entry.key
  try {
    await addEntryToPlan(entry)
  } catch (e) {
    ui.showToast('Не удалось добавить', 'error')
  } finally {
    addingKey.value = ''
  }
}

const addAllRemaining = async () => {
  if (addingKey.value || !remaining.value.length) return
  platform.haptic.impact('medium')
  addingKey.value = 'all'
  const count = remaining.value.length
  try {
    for (const entry of remaining.value) await addEntryToPlan(entry)
    ui.showToast(`Добавлено в план: ${count}`, 'success')
  } catch (e) {
    ui.showToast('Не удалось добавить часть блюд', 'error')
  } finally {
    addingKey.value = ''
  }
}

const lowerFirst = (text = '') => text.charAt(0).toLowerCase() + text.slice(1)

const close = () => {
  platform.haptic.impact('light')
  emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[70] flex flex-col justify-end" @click.self="close">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="sheet sheet-tall modal-content">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <button @click="close" class="sheet-close tap-effect" aria-label="Закрыть">
            <span class="material-icons-round text-xl">close</span>
          </button>
          <div class="min-w-0">
            <h3 class="sheet-title">Идеи на неделю</h3>
            <p v-if="periodLabel" class="sheet-subtitle">{{ periodLabel }}</p>
          </div>
          <button
            @click="toggleFiltersPanel"
            class="sheet-close tap-effect relative"
            :class="showFilters || filters.length ? '!bg-slate-900 !text-white' : ''"
            aria-label="Фильтры"
          >
            <span class="material-icons-round text-xl">tune</span>
            <span v-if="filters.length && !showFilters" class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-white text-slate-900 border border-slate-900 text-[9px] font-bold flex items-center justify-center">{{ filters.length }}</span>
          </button>
        </div>

        <!-- Что заполнять — всегда на виду: список сразу подстраивается -->
        <div class="shrink-0 px-5 pt-3 pb-3 border-b border-slate-100">
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            <span class="w-10 text-[11px] text-secondary shrink-0">Когда</span>
            <button
              v-for="m in dictionaries.mealTypes"
              :key="m.id"
              @click="toggleMealType(m.id)"
              class="chip tap-effect"
              :class="selectedMealTypes.includes(m.id) ? 'chip-active' : ''"
            >{{ m.name }}</button>
          </div>
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 mt-2">
            <span class="w-10 text-[11px] text-secondary shrink-0">Что</span>
            <button
              @click="selectDishType(null)"
              class="chip tap-effect"
              :class="dishTypeId === null ? 'chip-active' : ''"
            >Любое</button>
            <button
              v-for="t in dictionaries.dishTypes"
              :key="t.id"
              @click="selectDishType(t.id)"
              class="chip tap-effect"
              :class="dishTypeId === t.id ? 'chip-active' : ''"
            >{{ t.name }}</button>
          </div>

          <!-- Фильтры — за кнопкой в шапке -->
          <CollapseTransition>
            <div v-if="showFilters" class="pt-2.5">
              <div class="text-[11px] text-secondary mb-1.5">Предлагать только блюда</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="f in filterOptions"
                  :key="f.id"
                  @click="toggleFilter(f.id)"
                  class="chip tap-effect"
                  :class="filters.includes(f.id) ? 'chip-active' : ''"
                >{{ f.name }}</button>
              </div>
            </div>
          </CollapseTransition>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 bg-slate-50">
          <div v-if="!days.length" class="text-center text-[13px] text-secondary bg-white rounded-2xl border border-slate-100 px-5 py-6 leading-relaxed">
            Выберите, какие приёмы пищи заполнить
          </div>

          <Transition name="fade" mode="out-in">
          <div :key="draftVersion">
            <div v-for="day in days" :key="day.date" class="mb-4">
              <div class="flex items-baseline justify-between px-1 mb-1.5">
                <span class="text-[12px] font-semibold text-slate-900 first-letter:uppercase">{{ day.label }}</span>
                <span v-if="day.kcal" class="text-[11px] text-secondary">{{ formatKcal(day.kcal) }} ккал</span>
              </div>

              <div class="space-y-1.5">
                <template v-for="row in day.rows" :key="row.slot.id">
                  <!-- Предложение (пунктир) или уже добавленное (сплошная рамка) -->
                  <div
                    v-if="row.entry"
                    @click="toggleExpanded(row.entry.key)"
                    class="bg-white rounded-2xl pl-3.5 pr-2.5 py-2.5 cursor-pointer transition-colors"
                    :class="added.has(row.entry.key) ? 'border border-slate-200' : 'border border-dashed border-slate-300'"
                  >
                    <div class="flex items-center gap-2">
                      <Transition name="swap" mode="out-in">
                        <div :key="row.entry.dishId + '|' + (row.entry.garnishId || '')" class="flex-1 min-w-0">
                          <div class="text-[10px] leading-none mb-1 truncate">
                            <span class="font-semibold uppercase tracking-wide text-slate-400">{{ row.slot.name }}</span>
                            <span v-if="row.planned.length && !added.has(row.entry.key)" class="text-slate-400"> · в плане: {{ row.planned.join(', ') }}</span>
                          </div>
                          <div class="card-title leading-snug">{{ dishById.get(row.entry.dishId)?.name }}</div>
                          <div v-if="row.entry.garnishId" class="text-[11px] text-slate-600 flex items-center gap-1 leading-snug">
                            <span>+ {{ lowerFirst(dishById.get(row.entry.garnishId)?.name) }}</span>
                            <button v-if="!added.has(row.entry.key)" @click.stop="removeGarnish(row.entry)" class="text-slate-300 flex shrink-0" aria-label="Убрать гарнир">
                              <span class="material-icons-round text-[14px]">close</span>
                            </button>
                          </div>
                          <div class="flex items-center gap-1 mt-1 text-[11px] leading-none min-w-0">
                            <template v-if="added.has(row.entry.key)">
                              <span class="material-icons-round text-[13px] text-slate-900">check</span>
                              <span class="font-semibold text-slate-900">в плане</span>
                            </template>
                            <template v-else-if="row.entry.badge">
                              <span class="material-icons-round text-[13px] text-slate-400 shrink-0">{{ row.entry.badge.icon }}</span>
                              <span class="text-slate-500 truncate">{{ row.entry.badge.short }}</span>
                            </template>
                            <span v-if="entryKcal(row.entry)" class="text-slate-400 shrink-0">
                              <template v-if="added.has(row.entry.key) || row.entry.badge">·</template> {{ entryKcal(row.entry) }} ккал
                            </span>
                          </div>
                        </div>
                      </Transition>

                      <template v-if="added.has(row.entry.key)">
                        <button @click.stop="undoEntry(row.entry)" :disabled="!!addingKey" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 tap-effect" aria-label="Убрать из плана">
                          <span v-if="addingKey === row.entry.key" class="material-icons-round text-base animate-spin">sync</span>
                          <span v-else class="material-icons-round text-base">undo</span>
                        </button>
                      </template>
                      <template v-else>
                        <button @click.stop="replaceEntry(row.entry)" :disabled="!!addingKey" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 tap-effect" aria-label="Другое блюдо">
                          <span class="material-icons-round text-base">autorenew</span>
                        </button>
                        <button @click.stop="addEntry(row.entry)" :disabled="!!addingKey" class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 tap-effect" aria-label="Добавить в план">
                          <span v-if="addingKey === row.entry.key" class="material-icons-round text-base animate-spin">sync</span>
                          <span v-else class="material-icons-round text-lg">add</span>
                        </button>
                      </template>
                    </div>

                    <!-- Полное объяснение — по нажатию на карточку -->
                    <CollapseTransition>
                      <div v-if="expanded.has(row.entry.key) && row.entry.reasons.length" class="pt-1.5 pr-1">
                        <div v-for="reason in row.entry.reasons" :key="reason" class="text-[11px] text-secondary leading-snug">{{ reason }}</div>
                      </div>
                    </CollapseTransition>
                  </div>

                  <!-- Уже в плане или подобрать нечего — тихая строка для контекста -->
                  <div v-else class="flex items-baseline gap-2 px-3.5 py-1.5 min-w-0">
                    <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-300 shrink-0">{{ row.slot.name }}</span>
                    <span v-if="row.planned.length" class="text-[12px] text-slate-400 truncate">{{ row.planned.join(', ') }}</span>
                    <span v-else class="text-[12px] text-slate-300 truncate">{{ filters.length ? 'нет блюд под фильтры' : dishTypeName ? `нет блюд «${dishTypeName}» с отметкой «${row.slot.name}»` : 'нет подходящих блюд' }}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
          </Transition>
        </div>

        <!-- Действия -->
        <div v-if="days.length" class="shrink-0 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] border-t border-slate-100 bg-white flex items-center gap-2">
          <button @click="reshuffle" :disabled="!!addingKey" class="w-11 h-11 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 tap-effect" aria-label="Подобрать иначе" title="Подобрать иначе">
            <span class="material-icons-round text-xl">shuffle</span>
          </button>
          <button
            v-if="remaining.length"
            @click="addAllRemaining"
            :disabled="!!addingKey"
            class="btn-primary flex-1 h-11 !py-0 text-sm flex items-center justify-center gap-2"
          >
            <span v-if="addingKey === 'all'" class="material-icons-round text-sm animate-spin">sync</span>
            Добавить {{ added.size ? 'оставшиеся' : 'все' }} · {{ remaining.length }}
          </button>
          <button v-else @click="close" class="btn-primary flex-1 h-11 !py-0 text-sm">Готово</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
