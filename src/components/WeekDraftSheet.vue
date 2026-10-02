<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { usePlanStore } from '../stores/plan'
import { useDishStore } from '../stores/dishes'
import { useDictionariesStore } from '../stores/dictionaries'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { usePlatformStore } from '../stores/platform'
import { buildWeekDraft, nextAlternative, SUGGESTION_FILTERS } from '../lib/suggestions'

// "Идеи на неделю": подбираем блюда в пустые слоты. Пользователь добавляет
// понравившиеся по одному (+), может заменить вариант или добавить все сразу.
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
const mealTypeById = computed(() => new Map(dictionaries.mealTypes.map((m) => [m.id, m])))
const mealTypeNames = computed(() => Object.fromEntries(dictionaries.mealTypes.map((m) => [m.id, m.name])))

// Настройки подбора. Перекус по умолчанию не заполняем — его чаще решают на ходу.
const selectedMealTypes = ref([])
const filters = ref([])
const seed = ref(0)
const draft = ref([])
const tried = ref({}) // key -> [dishId, ...] уже показанные варианты для слота
const added = ref(new Map()) // ключ слота -> [id записей плана], уже добавленные
const addingKey = ref('')
const draftVersion = ref(0) // ключ для анимации смены всей подборки

const filterOptions = computed(() => [
  ...SUGGESTION_FILTERS.filter((f) => f.id !== 'long_ago'),
  ...(dictionaries.availableTags || []).map((t) => ({ id: t.id, name: t.name }))
])

// Прошедшие дни периода не трогаем
const fromDate = computed(() => {
  const start = startOfDay(new Date(props.periodStart))
  const today = startOfDay(new Date())
  return isBefore(start, today) ? today : start
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
    portions: portions.value,
    seed: seed.value,
    fromDate: fromDate.value,
    mealTypeNames: mealTypeNames.value
  })
  tried.value = Object.fromEntries(draft.value.map((e) => [e.key, [e.dishId]]))
  added.value = new Map()
  draftVersion.value++
}

watch(() => props.isOpen, (open) => {
  if (!open) return
  selectedMealTypes.value = dictionaries.mealTypes.filter((m) => m.name !== 'Перекус').map((m) => m.id)
  filters.value = []
  seed.value = 0
  rebuild()
}, { immediate: true })

const toggleMealType = (id) => {
  platform.haptic.selection()
  const list = selectedMealTypes.value
  selectedMealTypes.value = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  rebuild()
}
const toggleFilter = (id) => {
  platform.haptic.selection()
  filters.value = filters.value.includes(id) ? filters.value.filter((x) => x !== id) : [...filters.value, id]
  rebuild()
}
const reshuffle = () => {
  platform.haptic.impact('light')
  seed.value = Math.floor(Math.random() * 1e9) + 1
  rebuild()
}

const replaceEntry = (entry) => {
  platform.haptic.selection()
  const seen = tried.value[entry.key] || [entry.dishId]
  let next = nextAlternative({
    planItems: planStore.plan, draft: draft.value, entry, dishes: dishStore.dishes,
    periodStart: props.periodStart, periodLength: periodLength.value, filters: filters.value,
    garnishTypeId: garnishTypeId.value, portions: portions.value, tried: seen, mealTypeNames: mealTypeNames.value
  })
  if (!next) {
    // Варианты закончились — начинаем круг заново
    next = nextAlternative({
      planItems: planStore.plan, draft: draft.value, entry, dishes: dishStore.dishes,
      periodStart: props.periodStart, periodLength: periodLength.value, filters: filters.value,
      garnishTypeId: garnishTypeId.value, portions: portions.value, tried: [entry.dishId], mealTypeNames: mealTypeNames.value
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

// Группировка по дням для отображения
const days = computed(() => {
  const groups = []
  for (const entry of draft.value) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== entry.date) {
      g = { date: entry.date, label: format(parseISO(entry.date), 'EEEEEE, d MMMM', { locale: ru }), entries: [] }
      groups.push(g)
    }
    g.entries.push(entry)
  }
  return groups
})

const remaining = computed(() => draft.value.filter((e) => !added.value.has(e.key)))

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

// Повторное нажатие на "В плане" — убрать обратно (на случай случайного нажатия)
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
            <p class="sheet-subtitle">на свободные приёмы пищи</p>
          </div>
          <div></div>
        </div>

        <!-- Настройки подбора -->
        <div class="shrink-0 px-5 pt-3 pb-3 border-b border-slate-100 space-y-2.5">
          <div>
            <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Подобрать на</div>
            <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
              <button
                v-for="m in dictionaries.mealTypes"
                :key="m.id"
                @click="toggleMealType(m.id)"
                class="chip tap-effect"
                :class="selectedMealTypes.includes(m.id) ? 'chip-active' : ''"
              >{{ m.name }}</button>
            </div>
          </div>
          <div>
            <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Показывать только</div>
            <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
              <button
                v-for="f in filterOptions"
                :key="f.id"
                @click="toggleFilter(f.id)"
                class="chip tap-effect"
                :class="filters.includes(f.id) ? 'chip-active' : ''"
              >{{ f.name }}</button>
            </div>
          </div>
        </div>

        <!-- Черновик -->
        <div class="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom,0px))] bg-slate-50">
          <div v-if="draft.length" class="flex items-start justify-between gap-3 mb-3 px-1">
            <p class="text-[12px] text-secondary leading-snug">
              <template v-if="added.size">Добавлено в план: {{ added.size }} из {{ draft.length }}. Нажмите «В плане» ещё раз, чтобы убрать.</template>
              <template v-else>Подобрали блюда в свободные приёмы пищи с сегодняшнего дня. Нажмите <b class="text-slate-900">+</b>, чтобы добавить блюдо в план, или <span class="material-icons-round text-[13px] align-[-2px] text-slate-900">autorenew</span>, чтобы заменить.</template>
            </p>
            <button @click="reshuffle" class="text-[11px] font-semibold text-slate-500 flex items-center gap-1 tap-effect shrink-0 pt-0.5">
              <span class="material-icons-round text-sm">refresh</span>
              Подобрать иначе
            </button>
          </div>

          <div v-if="!draft.length" class="text-center text-[13px] text-secondary bg-white rounded-2xl border border-slate-100 px-5 py-6 leading-relaxed">
            <template v-if="!selectedMealTypes.length">Выберите приёмы пищи, которые нужно заполнить</template>
            <template v-else-if="filters.length">Под выбранные фильтры блюд не нашлось — попробуйте убрать часть фильтров</template>
            <template v-else>Все выбранные приёмы пищи на этой неделе уже запланированы, или для них нет подходящих блюд</template>
          </div>

          <Transition name="fade" mode="out-in">
          <div :key="draftVersion">
          <div v-for="day in days" :key="day.date" class="mb-3">
            <div class="app-eyebrow px-1 mb-1.5">{{ day.label }}</div>
            <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div
                v-for="entry in day.entries"
                :key="entry.key"
                class="flex items-start gap-2 px-3.5 py-2.5 border-b border-slate-50 last:border-0"
              >
                <Transition name="swap" mode="out-in">
                <div :key="entry.dishId + '|' + (entry.garnishId || '')" class="flex-1 min-w-0">
                  <div class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{{ mealTypeById.get(entry.mealTypeId)?.name }}</div>
                  <div class="card-title leading-snug">{{ dishById.get(entry.dishId)?.name }}</div>
                  <div v-if="entry.garnishId" class="text-[12px] text-slate-700 flex items-center gap-1 min-w-0 mt-0.5">
                    <span>Гарнир: {{ lowerFirst(dishById.get(entry.garnishId)?.name) }}</span>
                    <button v-if="!added.has(entry.key)" @click="removeGarnish(entry)" class="text-slate-300 flex shrink-0" aria-label="Убрать гарнир">
                      <span class="material-icons-round text-sm">close</span>
                    </button>
                  </div>
                  <div v-for="reason in entry.reasons" :key="reason" class="text-[11px] text-secondary leading-snug mt-0.5">{{ reason }}</div>
                </div>
                </Transition>
                <template v-if="added.has(entry.key)">
                  <button
                    @click="undoEntry(entry)"
                    :disabled="!!addingKey"
                    class="h-8 px-2.5 rounded-full bg-slate-100 text-slate-900 text-[11px] font-semibold flex items-center gap-1 shrink-0 tap-effect"
                    aria-label="Убрать из плана"
                    title="Нажмите ещё раз, чтобы убрать из плана"
                  >
                    <span v-if="addingKey === entry.key" class="material-icons-round text-sm animate-spin">sync</span>
                    <span v-else class="material-icons-round text-sm">check</span>
                    В плане
                  </button>
                </template>
                <template v-else>
                  <button @click="replaceEntry(entry)" :disabled="!!addingKey" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 tap-effect" aria-label="Другое блюдо">
                    <span class="material-icons-round text-base">autorenew</span>
                  </button>
                  <button @click="addEntry(entry)" :disabled="!!addingKey" class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 tap-effect" aria-label="Добавить в план">
                    <span v-if="addingKey === entry.key" class="material-icons-round text-base animate-spin">sync</span>
                    <span v-else class="material-icons-round text-lg">add</span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <button
            v-if="remaining.length > 1"
            @click="addAllRemaining"
            :disabled="!!addingKey"
            class="btn-secondary w-full text-sm mt-1 flex items-center justify-center gap-2"
          >
            <span v-if="addingKey === 'all'" class="material-icons-round text-sm animate-spin">sync</span>
            Добавить все оставшиеся · {{ remaining.length }}
          </button>
          </div>
          </Transition>
        </div>
      </div>
    </div>
  </Transition>
</template>
