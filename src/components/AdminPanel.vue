<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { format, parseISO, startOfWeek, addWeeks, isValid } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAppConfigStore } from '../stores/appConfig'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { usePlatformStore } from '../stores/platform'
import { formatUnit } from '../lib/utils'

const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close'])

const appConfig = useAppConfigStore()
const dictionaries = useDictionariesStore()
const ui = useUIStore()
const platform = usePlatformStore()

const modalRegistryId = `admin-panel-${Math.random().toString(36).slice(2)}`
watch(() => props.isOpen, (open) => {
  ui.syncModalState(modalRegistryId, open)
  if (open) loadTab(activeTab.value)
}, { immediate: true })
onUnmounted(() => ui.clearModalState(modalRegistryId))

const tabs = [
  { id: 'stats', label: 'Статистика' },
  { id: 'families', label: 'Семьи' },
  { id: 'dicts', label: 'Справочники' },
  { id: 'settings', label: 'Настройки' }
]
const activeTab = ref('stats')
const switchTab = (id) => {
  if (activeTab.value === id) return
  platform.haptic.selection()
  activeTab.value = id
  loadTab(id)
}

const errorText = (e) => e?.response?.message || e?.message || 'Не удалось выполнить запрос'

// ---------- Данные ----------
const stats = ref(null)
const dicts = ref(null)
const loading = ref(false)

const loadStats = async () => {
  loading.value = true
  try {
    stats.value = await appConfig.adminRequest('/stats')
  } catch (e) {
    ui.showToast(errorText(e), 'error')
  } finally {
    loading.value = false
  }
}

const loadDicts = async () => {
  loading.value = true
  try {
    dicts.value = await appConfig.adminRequest('/dicts')
  } catch (e) {
    ui.showToast(errorText(e), 'error')
  } finally {
    loading.value = false
  }
}

const loadTab = (id) => {
  if ((id === 'stats' || id === 'families') && !stats.value) loadStats()
  if (id === 'dicts' && !dicts.value) loadDicts()
  if (id === 'settings') syncAnnouncementDraft()
}

const refresh = () => {
  platform.haptic.impact('light')
  if (activeTab.value === 'dicts') loadDicts()
  else if (activeTab.value === 'settings') appConfig.fetchConfig().then(syncAnnouncementDraft)
  else loadStats()
}

// ---------- Форматирование ----------
const toDate = (value) => {
  if (!value) return null
  const d = parseISO(String(value).replace(' ', 'T'))
  return isValid(d) ? d : null
}
const formatDay = (value) => {
  const d = toDate(value)
  return d ? format(d, 'd MMM yyyy', { locale: ru }) : '—'
}
const displayEmail = (email) => (/^tg_\d+@telegram\.local$/.test(email) ? 'Telegram-аккаунт' : email)

// ---------- Статистика ----------
const tiles = computed(() => {
  const t = stats.value?.totals
  if (!t) return []
  return [
    { label: 'Пользователи', value: t.users, note: `+${t.usersNew7} за 7 дней · +${t.usersNew30} за 30` },
    { label: 'Семьи', value: t.households, note: `активны за 7 дней: ${t.activeHouseholds7}` },
    { label: 'Блюда', value: t.dishes, note: `ингредиентов: ${t.ingredients}` },
    { label: 'Продукты', value: t.products, note: 'во всех семьях' },
    { label: 'Записи в плане', value: t.plan, note: `на ближайшие 7 дней: ${t.planNext7}` }
  ]
})

// Регистрации по неделям за 12 недель (неделя с понедельника)
const WEEKS = 12
const signupWeeks = computed(() => {
  const firstWeek = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), -(WEEKS - 1))
  const buckets = Array.from({ length: WEEKS }, (_, i) => ({ start: addWeeks(firstWeek, i), count: 0 }))
  for (const created of stats.value?.signups || []) {
    const d = toDate(created)
    if (!d) continue
    const idx = Math.floor((startOfWeek(d, { weekStartsOn: 1 }) - firstWeek) / (7 * 24 * 3600 * 1000))
    if (idx >= 0 && idx < WEEKS) buckets[idx].count++
  }
  return buckets.map((b) => ({ ...b, label: format(b.start, 'd MMM', { locale: ru }) }))
})
const signupMax = computed(() => Math.max(1, ...signupWeeks.value.map((w) => w.count)))
const signupTotal = computed(() => signupWeeks.value.reduce((sum, w) => sum + w.count, 0))

// ---------- Семьи ----------
const usersByHousehold = computed(() => {
  const map = new Map()
  for (const u of stats.value?.users || []) {
    const key = u.household || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(u)
  }
  return map
})
const householdIds = computed(() => new Set((stats.value?.households || []).map((h) => h.id)))
const usersWithoutHousehold = computed(() =>
  (stats.value?.users || []).filter((u) => !u.household || !householdIds.value.has(u.household))
)

// ---------- Справочники ----------
const dictTabs = [
  { id: 'meal_types', label: 'Приёмы пищи' },
  { id: 'dish_types', label: 'Виды блюд' },
  { id: 'dish_tags', label: 'Теги' },
  { id: 'product_templates', label: 'Стартовые продукты' }
]
const activeDict = ref('meal_types')
const UNITS = ['Кг', 'Г', 'Л', 'Мл', 'Шт', 'Упак']
const templateCategory = ref(dictionaries.productCategories[0]?.name || 'Разное')

const dictItems = computed(() => {
  const list = [...(dicts.value?.[activeDict.value] || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  if (activeDict.value === 'product_templates') return list.filter((i) => i.category === templateCategory.value)
  return list
})
const templateCountByCategory = computed(() => {
  const counts = {}
  for (const t of dicts.value?.product_templates || []) counts[t.category] = (counts[t.category] || 0) + 1
  return counts
})

const editingId = ref(null)
const editName = ref('')
const editUnit = ref('Шт')
const newName = ref('')
const newUnit = ref('Шт')
const busy = ref(false)

const startEdit = (item) => {
  editingId.value = item.id
  editName.value = item.name
  editUnit.value = item.unit || 'Шт'
}
const cancelEdit = () => { editingId.value = null }

// После любых правок обновляем справочники в самом приложении
const afterDictChange = async () => {
  await loadDicts()
  dictionaries.fetchDictionaries()
}

const runDict = async (fn, successText) => {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
    if (successText) ui.showToast(successText, 'success')
    await afterDictChange()
  } catch (e) {
    ui.showToast(errorText(e), 'error')
  } finally {
    busy.value = false
  }
}

const saveEdit = (item) => runDict(async () => {
  const body = { name: editName.value }
  if (activeDict.value === 'product_templates') body.unit = editUnit.value
  await appConfig.adminRequest(`/dicts/${activeDict.value}/${item.id}`, { method: 'PATCH', body })
  editingId.value = null
}, 'Сохранено')

const addItem = () => {
  if (!newName.value.trim()) return
  return runDict(async () => {
    const body = { name: newName.value }
    if (activeDict.value === 'product_templates') {
      body.category = templateCategory.value
      body.unit = newUnit.value
    }
    await appConfig.adminRequest(`/dicts/${activeDict.value}`, { method: 'POST', body })
    newName.value = ''
  }, 'Добавлено')
}

const removeItem = async (item) => {
  const ok = await ui.confirm(`Удалить «${item.name}»?`, { okText: 'Удалить', cancelText: 'Отмена' })
  if (!ok) return
  return runDict(() => appConfig.adminRequest(`/dicts/${activeDict.value}/${item.id}`, { method: 'DELETE' }), 'Удалено')
}

// Перестановка соседей: меняем местами sort_order
const move = (index, delta) => {
  const list = dictItems.value
  const a = list[index]
  const b = list[index + delta]
  if (!a || !b) return
  platform.haptic.selection()
  return runDict(async () => {
    const orderA = a.sort_order ?? index
    const orderB = b.sort_order ?? index + delta
    await appConfig.adminRequest(`/dicts/${activeDict.value}/${a.id}`, { method: 'PATCH', body: { sort_order: orderB === orderA ? orderA + delta : orderB } })
    await appConfig.adminRequest(`/dicts/${activeDict.value}/${b.id}`, { method: 'PATCH', body: { sort_order: orderA } })
  })
}

watch(activeDict, () => { editingId.value = null; newName.value = '' })

// ---------- Настройки ----------
const savingKey = ref('')
const toggleSetting = async (key, current) => {
  platform.haptic.selection()
  savingKey.value = key
  try {
    await appConfig.saveSetting(key, !current)
    ui.showToast('Настройка сохранена', 'success')
  } catch (e) {
    ui.showToast(errorText(e), 'error')
  } finally {
    savingKey.value = ''
  }
}

const announcementText = ref('')
const announcementEnabled = ref(false)
const syncAnnouncementDraft = () => {
  announcementText.value = appConfig.announcement.text
  announcementEnabled.value = appConfig.announcement.enabled
}
const announcementDirty = computed(() =>
  announcementText.value.trim() !== appConfig.announcement.text ||
  (announcementEnabled.value && !!announcementText.value.trim()) !== appConfig.announcement.enabled
)
const saveAnnouncement = async () => {
  savingKey.value = 'announcement'
  try {
    await appConfig.saveSetting('announcement', { enabled: announcementEnabled.value, text: announcementText.value })
    syncAnnouncementDraft()
    ui.showToast(appConfig.announcement.enabled ? 'Объявление опубликовано' : 'Объявление сохранено и скрыто', 'success')
  } catch (e) {
    ui.showToast(errorText(e), 'error')
  } finally {
    savingKey.value = ''
  }
}

const close = () => {
  platform.haptic.impact('light')
  emit('close')
}
</script>

<template>
  <Transition name="page">
    <div v-if="isOpen" class="fixed inset-0 z-[80] bg-slate-50 flex flex-col max-w-md mx-auto">
      <!-- Шапка -->
      <div class="bg-white rounded-b-[32px] border-b border-slate-100 px-5 pt-app-header pb-3 flex flex-col gap-2.5 shrink-0">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button @click="close" class="sheet-close tap-effect shrink-0" aria-label="Назад">
              <span class="material-icons-round text-xl">arrow_back</span>
            </button>
            <div class="min-w-0">
              <div class="app-eyebrow mb-1">Администрирование</div>
              <div class="app-title !mb-0 truncate">{{ tabs.find((t) => t.id === activeTab)?.label }}</div>
            </div>
          </div>
          <button @click="refresh" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 tap-effect shrink-0" aria-label="Обновить">
            <span class="material-icons-round text-xl" :class="loading ? 'animate-spin' : ''">refresh</span>
          </button>
        </div>

        <div class="bg-slate-100 p-0.5 rounded-xl grid grid-cols-4 h-9 shrink-0">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="switchTab(tab.id)"
            class="rounded-[10px] text-[10px] font-bold transition-colors"
            :class="activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400'"
          >{{ tab.label }}</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))] no-scrollbar">

        <!-- ===== Статистика ===== -->
        <Transition name="swap" mode="out-in">
        <div v-if="activeTab === 'stats'" class="space-y-3">
          <div v-if="!stats" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
          </div>
          <template v-else>
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="(tile, i) in tiles"
                :key="tile.label"
                class="bg-white rounded-2xl border border-slate-100 px-4 py-3"
                :class="i === 0 ? 'col-span-2' : ''"
              >
                <div class="text-[11px] text-secondary">{{ tile.label }}</div>
                <div class="text-[22px] font-semibold leading-tight tracking-tight mt-0.5">{{ tile.value }}</div>
                <div class="text-[10px] text-secondary mt-0.5 leading-snug">{{ tile.note }}</div>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 px-4 pt-3 pb-3">
              <div class="flex items-baseline justify-between mb-3">
                <div class="card-title text-[13px]">Регистрации по неделям</div>
                <div class="text-[11px] text-secondary">{{ signupTotal }} за 12 недель</div>
              </div>
              <div class="flex items-end gap-[2px] h-24" role="img" :aria-label="`Регистрации по неделям: ${signupWeeks.map((w) => `${w.label} — ${w.count}`).join(', ')}`">
                <div
                  v-for="week in signupWeeks"
                  :key="week.label"
                  class="flex-1 h-full flex flex-col justify-end items-center group"
                  :title="`Неделя с ${week.label}: ${week.count}`"
                >
                  <span v-if="week.count" class="text-[9px] font-semibold text-slate-900 mb-0.5">{{ week.count }}</span>
                  <div
                    class="w-full max-w-[16px] rounded-t-[4px] transition-colors"
                    :class="week.count ? 'bg-slate-900 group-hover:bg-slate-600' : 'bg-slate-100'"
                    :style="{ height: week.count ? `${Math.max(6, (week.count / signupMax) * 72)}px` : '2px' }"
                  ></div>
                </div>
              </div>
              <div class="flex justify-between text-[9px] text-secondary mt-1.5">
                <span>{{ signupWeeks[0]?.label }}</span>
                <span>{{ signupWeeks[signupWeeks.length - 1]?.label }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== Семьи и пользователи ===== -->
        <div v-else-if="activeTab === 'families'" class="space-y-2">
          <div v-if="!stats" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
          </div>
          <template v-else>
            <div
              v-for="h in stats.households"
              :key="h.id"
              class="bg-white rounded-2xl border border-slate-100 px-4 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="card-title truncate">{{ h.name || 'Без названия' }}</div>
                <div class="text-[10px] text-secondary shrink-0 pt-0.5">
                  {{ h.last_activity ? `активность ${formatDay(h.last_activity)}` : 'нет активности' }}
                </div>
              </div>
              <div class="text-[11px] text-secondary mt-0.5">
                {{ h.members }} участн. · {{ h.dishes }} блюд · {{ h.products }} продуктов · {{ h.plan_items }} в плане
              </div>
              <div class="mt-2 pt-2 border-t border-slate-50 space-y-1">
                <div
                  v-for="member in usersByHousehold.get(h.id) || []"
                  :key="member.id"
                  class="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span class="truncate text-slate-900">
                    {{ displayEmail(member.email) }}
                    <span v-if="member.email === h.owner_email" class="text-secondary"> · владелец</span>
                    <span v-if="member.is_admin" class="text-secondary"> · админ</span>
                  </span>
                  <span class="text-[10px] text-secondary shrink-0">{{ formatDay(member.created) }}</span>
                </div>
              </div>
            </div>

            <div v-if="usersWithoutHousehold.length" class="bg-white rounded-2xl border border-slate-100 px-4 py-3">
              <div class="card-title">Без семьи</div>
              <div class="mt-2 space-y-1">
                <div v-for="member in usersWithoutHousehold" :key="member.id" class="flex items-center justify-between gap-2 text-[12px]">
                  <span class="truncate">{{ displayEmail(member.email) }}</span>
                  <span class="text-[10px] text-secondary shrink-0">{{ formatDay(member.created) }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== Справочники ===== -->
        <div v-else-if="activeTab === 'dicts'" class="space-y-3">
          <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            <button
              v-for="d in dictTabs"
              :key="d.id"
              @click="activeDict = d.id"
              class="chip tap-effect"
              :class="activeDict === d.id ? 'chip-active' : ''"
            >{{ d.label }}</button>
          </div>

          <div v-if="activeDict === 'product_templates'" class="space-y-2">
            <p class="text-[11px] text-secondary px-1 leading-snug">Этот список копируется каждой новой семье при регистрации. У существующих семей продукты не меняются.</p>
            <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
              <button
                v-for="cat in dictionaries.productCategories"
                :key="cat.id"
                @click="templateCategory = cat.name"
                class="chip tap-effect"
                :class="templateCategory === cat.name ? 'chip-active' : ''"
              >
                {{ cat.name }}<span class="opacity-60">{{ templateCountByCategory[cat.name] || 0 }}</span>
              </button>
            </div>
          </div>

          <div v-if="!dicts" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
          </div>
          <div v-else class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div
              v-for="(item, index) in dictItems"
              :key="item.id"
              class="flex items-center gap-2 px-3 min-h-[44px] border-b border-slate-50 last:border-0"
            >
              <template v-if="editingId === item.id">
                <input
                  v-model="editName"
                  class="input-outline flex-1 min-w-0 !py-1.5 !px-3 !rounded-xl text-sm"
                  @keydown.enter="saveEdit(item)"
                  @keydown.esc="cancelEdit"
                >
                <select v-if="activeDict === 'product_templates'" v-model="editUnit" class="input-outline !py-1.5 !px-2 !rounded-xl text-sm w-[68px]">
                  <option v-for="u in UNITS" :key="u" :value="u">{{ formatUnit(u) }}</option>
                </select>
                <button @click="saveEdit(item)" :disabled="busy" class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0" aria-label="Сохранить">
                  <span class="material-icons-round text-base">check</span>
                </button>
                <button @click="cancelEdit" class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0" aria-label="Отмена">
                  <span class="material-icons-round text-base">close</span>
                </button>
              </template>
              <template v-else>
                <button @click="startEdit(item)" class="flex-1 min-w-0 text-left py-2 !rounded-none">
                  <div class="text-sm text-slate-900 truncate">{{ item.name }}</div>
                  <div class="text-[10px] text-secondary">
                    <template v-if="activeDict === 'product_templates'">{{ formatUnit(item.unit) }}</template>
                    <template v-else>{{ item.usage ? `используется: ${item.usage}` : 'не используется' }}</template>
                  </div>
                </button>
                <template v-if="activeDict !== 'product_templates'">
                  <button @click="move(index, -1)" :disabled="index === 0 || busy" class="w-7 h-7 flex items-center justify-center text-slate-400 disabled:opacity-20" aria-label="Выше">
                    <span class="material-icons-round text-lg">keyboard_arrow_up</span>
                  </button>
                  <button @click="move(index, 1)" :disabled="index === dictItems.length - 1 || busy" class="w-7 h-7 flex items-center justify-center text-slate-400 disabled:opacity-20" aria-label="Ниже">
                    <span class="material-icons-round text-lg">keyboard_arrow_down</span>
                  </button>
                </template>
                <button
                  @click="removeItem(item)"
                  :disabled="busy || item.usage > 0"
                  class="w-7 h-7 flex items-center justify-center text-slate-300 disabled:opacity-20"
                  :aria-label="item.usage > 0 ? 'Используется — удалить нельзя' : 'Удалить'"
                  :title="item.usage > 0 ? 'Используется — удалить нельзя, можно переименовать' : 'Удалить'"
                >
                  <span class="material-icons-round text-lg">delete_outline</span>
                </button>
              </template>
            </div>
            <div v-if="!dictItems.length" class="px-4 py-4 text-sm text-secondary text-center">Пусто</div>

            <!-- Добавление -->
            <form @submit.prevent="addItem" class="flex items-center gap-2 px-3 py-2 bg-slate-50/60 border-t border-slate-100">
              <input
                v-model="newName"
                :placeholder="activeDict === 'product_templates' ? `Новый продукт в «${templateCategory}»` : 'Добавить…'"
                class="input-outline flex-1 min-w-0 !py-1.5 !px-3 !rounded-xl text-sm"
              >
              <select v-if="activeDict === 'product_templates'" v-model="newUnit" class="input-outline !py-1.5 !px-2 !rounded-xl text-sm w-[68px]">
                <option v-for="u in UNITS" :key="u" :value="u">{{ formatUnit(u) }}</option>
              </select>
              <button type="submit" :disabled="busy || !newName.trim()" class="sheet-action !h-8 !px-3 shrink-0">Добавить</button>
            </form>
          </div>
          <p v-if="activeDict !== 'product_templates'" class="text-[11px] text-secondary px-1 leading-snug">
            Справочник общий для всех пользователей. Нажмите на название, чтобы переименовать. Удалить можно только то, что нигде не используется.
          </p>
        </div>

        <!-- ===== Настройки приложения ===== -->
        <div v-else-if="activeTab === 'settings'" class="space-y-3">
          <div class="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
            <div class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900">Регистрация новых пользователей</div>
                <div class="text-[11px] text-secondary leading-snug">Если выключить — войти смогут только существующие аккаунты</div>
              </div>
              <button
                @click="toggleSetting('registration_open', appConfig.registrationOpen)"
                :disabled="savingKey === 'registration_open'"
                class="w-11 h-6 rounded-full relative shrink-0 transition-colors"
                :class="appConfig.registrationOpen ? 'bg-slate-900' : 'bg-slate-200'"
                role="switch"
                :aria-checked="appConfig.registrationOpen"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform" :class="appConfig.registrationOpen ? 'translate-x-5' : 'translate-x-0'"></span>
              </button>
            </div>
            <div class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900">Голосовой ввод рецептов</div>
                <div class="text-[11px] text-secondary leading-snug">Распознавание речи и разбор рецепта через Yandex — расходует платный ключ</div>
              </div>
              <button
                @click="toggleSetting('voice_input_enabled', appConfig.voiceInputEnabled)"
                :disabled="savingKey === 'voice_input_enabled'"
                class="w-11 h-6 rounded-full relative shrink-0 transition-colors"
                :class="appConfig.voiceInputEnabled ? 'bg-slate-900' : 'bg-slate-200'"
                role="switch"
                :aria-checked="appConfig.voiceInputEnabled"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform" :class="appConfig.voiceInputEnabled ? 'translate-x-5' : 'translate-x-0'"></span>
              </button>
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-slate-100 px-4 py-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900">Объявление для всех</div>
                <div class="text-[11px] text-secondary leading-snug">Каждый увидит его один раз при входе. Новый текст покажется заново</div>
              </div>
              <button
                @click="announcementEnabled = !announcementEnabled; platform.haptic.selection()"
                class="w-11 h-6 rounded-full relative shrink-0 transition-colors"
                :class="announcementEnabled ? 'bg-slate-900' : 'bg-slate-200'"
                role="switch"
                :aria-checked="announcementEnabled"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform" :class="announcementEnabled ? 'translate-x-5' : 'translate-x-0'"></span>
              </button>
            </div>
            <textarea
              v-model="announcementText"
              maxlength="500"
              rows="4"
              placeholder="Например: в выходные будут технические работы"
              class="input-outline w-full !rounded-xl !px-3 !py-2.5 text-sm leading-relaxed resize-none"
            ></textarea>
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-secondary">{{ announcementText.length }}/500</span>
              <button
                @click="saveAnnouncement"
                :disabled="!announcementDirty || savingKey === 'announcement'"
                class="sheet-action"
              >
                <span v-if="savingKey === 'announcement'" class="material-icons-round text-sm animate-spin">sync</span>
                Сохранить
              </button>
            </div>
          </div>
        </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>
