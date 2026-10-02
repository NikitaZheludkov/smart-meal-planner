<script setup>
import { formatUnit } from '../lib/utils'
import CollapseTransition from '../components/CollapseTransition.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import { useSettingsStore } from '../stores/settings'
import { useShoppingStore } from '../stores/shopping' // <-- Added
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'
import { useDictionariesStore } from '../stores/dictionaries'
import { startOfWeek, addDays, format, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

const planStore = usePlanStore()
const settingsStore = useSettingsStore()
const shoppingStore = useShoppingStore() // <-- Added
const platform = usePlatformStore()
const uiStore = useUIStore()
const dictionaries = useDictionariesStore()

const categoryIcons = {
    'Овощи и фрукты': '🥦',
    'Молочные продукты': '🥛',
    'Мясо, птица, рыба': '🥩',
    'Хлеб': '🍞',
    'Крупы, макароны': '🌾',
    'Напитки': '🥤',
    'Бытовая химия': '🧼',
    'Соусы': '🧂',
    'Разное': '📦'
}
const getCategoryIcon = (categoryName) => categoryIcons[categoryName] || '📦'

const activeTab = ref('list') 
const transitionName = ref('slide-left')

// --- 1. УПРАВЛЕНИЕ ПЕРИОДОМ ---
const getInitialDate = () => {
    let date
    if (uiStore.plan.currentWeekStart) {
        const d = new Date(uiStore.plan.currentWeekStart)
        if (!isNaN(d.getTime())) date = d
    }
    
    // Always align to current startDay setting, even if we have a stored date
    const day = settingsStore.startDay ?? 1
    if (date) {
         return startOfWeek(date, { weekStartsOn: day })
    }
    
    return startOfWeek(new Date(), { weekStartsOn: day })
}

const currentWeekStart = ref(getInitialDate())
const periodLength = computed(() => settingsStore.periodLength || 7)

// Синхронизация с UI Store
watch(currentWeekStart, (newVal) => {
    uiStore.plan.currentWeekStart = new Date(newVal)
})

// Реакция на изменение дня начала недели в настройках
watch(() => settingsStore.startDay, (newStartDay) => {
    if (newStartDay !== undefined && newStartDay !== null) {
        currentWeekStart.value = startOfWeek(currentWeekStart.value, { weekStartsOn: newStartDay })
    }
})

const periodLabel = computed(() => {
    const start = currentWeekStart.value
    const end = addDays(start, periodLength.value - 1)
    return `${format(start, 'd MMM', { locale: ru })} – ${format(end, 'd MMM', { locale: ru })}`
})

const changePeriod = (dir) => {
    platform.haptic.selection()
    // Shift by periodLength
    const length = settingsStore.periodLength || 7
    currentWeekStart.value = addDays(currentWeekStart.value, dir * length)
}

const showTodayBtn = computed(() => {
    const userStartDay = settingsStore.startDay !== null ? settingsStore.startDay : 1
    const realCurrentWeekStart = startOfWeek(new Date(), { weekStartsOn: userStartDay })
    return !isSameDay(currentWeekStart.value, realCurrentWeekStart)
})

const goToToday = () => {
    const day = settingsStore.startDay !== null ? settingsStore.startDay : 1
    currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: day })
    platform.haptic.selection()
}

// --- 2. ЛОГИКА ГАЛОЧЕК ---
// Используем Store вместо локального состояния
const checkedIds = computed(() => shoppingStore.checkedIds)

onMounted(async () => {
    shoppingStore.fetchChecklist()
    if (planStore.plan.length === 0) planStore.fetchPlan()
    
    // Ensure settings are loaded so startDay is correct
    try {
        await settingsStore.fetchSettings()
        // Force re-alignment after fetching settings
        const day = settingsStore.startDay ?? 1
        const current = currentWeekStart.value
        const aligned = startOfWeek(current, { weekStartsOn: day })
        if (!isSameDay(current, aligned)) {
            currentWeekStart.value = aligned
        }
    } catch(e) {}
})

const toggleCheck = (id) => {
    platform.haptic.impact('medium')
    const newState = !shoppingStore.isChecked(id)
    shoppingStore.toggleProduct(id, newState)
}

const expandedProductIds = ref(new Set())
const toggleExpand = (id) => {
    if (expandedProductIds.value.has(id)) expandedProductIds.value.delete(id)
    else {
        expandedProductIds.value.add(id)
        platform.haptic.selection()
    }
}

// --- 3. ДАННЫЕ ИЗ STORE ---
const shoppingList = computed(() => shoppingStore.shoppingList)
const dishStats = computed(() => shoppingStore.dishStats)

const groupedList = computed(() => {
    const items = [...shoppingList.value]
    
    const sorter = (a, b) => {
        const aChecked = checkedIds.value.has(a.id)
        const bChecked = checkedIds.value.has(b.id)
        
        if (aChecked !== bChecked) {
            return aChecked ? 1 : -1
        }
        return a.name.localeCompare(b.name)
    }
    
    if (activeTab.value === 'departments') {
        const groups = {}
        items.sort(sorter).forEach(item => {
            const cat = item.category
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(item)
        })

        // Сортируем категории в каноническом порядке справочника (тот же,
        // что в "Продуктах"), а не "как первый раз встретились" — иначе
        // порядок скачет от недели к неделе в зависимости от состава списка.
        const order = dictionaries.productCategories.map((c) => c.name)
        const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
            const ia = order.indexOf(a)
            const ib = order.indexOf(b)
            return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
        })
        return Object.fromEntries(sortedEntries)
    } else {
        return { 'Все': items.sort(sorter) }
    }
})

const totalItems = computed(() => shoppingList.value.length)
const countChecked = computed(() => shoppingList.value.filter(i => checkedIds.value.has(i.id)).length)

const switchViewTab = (mode) => {
    if(activeTab.value !== mode) {
        transitionName.value = mode === 'departments' ? 'slide-left' : 'slide-right'
        platform.haptic.selection()
        activeTab.value = mode
    }
}
const resetChecks = async () => {
    if (await uiStore.confirm('Снять все отметки?', { okText: 'Снять', cancelText: 'Отмена' })) {
        await shoppingStore.clearList()
        platform.haptic.impact('medium')
    }
}

const copyList = () => {
    const text = shoppingList.value
        .map(item => `${item.name} - ${formatQuantity(item)}`)
        .join('\n')
    
    platform.copyText(text).then((ok) => {
        if (ok) {
            platform.haptic.notification('success')
            uiStore.showToast('Список скопирован', 'success')
        } else {
            platform.haptic.notification('error')
            uiStore.showToast('Не удалось скопировать список', 'error')
        }
    })
}

const formatAmount = (val) => {
    if (Number.isInteger(val)) return val
    return parseFloat(val.toFixed(3))
}

// Крупные суммы в граммах/миллилитрах показываем в кг/л: "1500 Г" → "1.5 кг".
const formatQuantity = (item) => {
    if (item.unit === 'Г' && item.amount >= 1000) return `${formatAmount(item.amount / 1000)} кг`
    if (item.unit === 'Мл' && item.amount >= 1000) return `${formatAmount(item.amount / 1000)} л`
    return `${formatAmount(item.amount)} ${formatUnit(item.unit)}`
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-10 relative overflow-hidden flex flex-col border-b border-slate-100">
      
      <div class="px-5 pt-app-header pb-3 flex flex-col gap-2.5">
          
        <!-- Header Row -->
        <div class="flex items-center justify-between">
            <div class="tap-effect" @click="goToToday">
                <div class="app-eyebrow mb-1">{{ periodLabel }}</div>
                <h1 class="app-title mb-0">Купить</h1>
            </div>
            
            <div class="flex items-center gap-1">
                <button
                    v-if="showTodayBtn"
                    @click="goToToday"
                    class="h-9 px-3 mr-1 flex items-center rounded-full bg-slate-900 text-white text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform tap-effect"
                >
                    Сегодня
                </button>

                <button @click="changePeriod(-1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-transform tap-effect">
                    <span class="material-icons-round text-xl">chevron_left</span>
                </button>
                <button @click="changePeriod(1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-transform tap-effect">
                    <span class="material-icons-round text-xl">chevron_right</span>
                </button>
            </div>
        </div>

        <!-- Controls Row (Smaller) -->
        <div class="flex items-center gap-2 w-full h-9">
            <!-- View Switcher -->
            <div class="flex-[2] bg-slate-50 border border-slate-100 p-0.5 rounded-xl flex items-center h-full">
                <button @click="switchViewTab('list')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-colors" :class="activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-base">format_list_bulleted</span>
                </button>
                <button @click="switchViewTab('departments')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-colors" :class="activeTab === 'departments' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-base">grid_view</span>
                </button>
            </div>

            <!-- Reset Checks Button -->
             <button @click="resetChecks" class="h-full flex-1 btn-secondary flex items-center justify-center text-slate-400 tap-effect p-0 shadow-sm">
                <span class="material-icons-round text-lg">remove_done</span>
            </button>

            <!-- Copy List Button -->
            <button @click="copyList" class="h-full flex-1 btn-secondary text-slate-900 flex items-center justify-center tap-effect p-0 shadow-sm">
                <span class="material-icons-round text-lg">content_copy</span>
            </button>
        </div>
      </div>

      <!-- Overall Progress -->
      <div v-if="totalItems > 0" class="px-5 pb-3">
          <div class="flex items-center justify-between mb-1.5">
              <span class="text-[11px] font-bold text-slate-500">
                  Куплено <span class="text-slate-900 font-bold">{{ countChecked }}</span> из {{ totalItems }}
              </span>
              <span class="text-[11px] font-bold text-slate-900">{{ Math.round(countChecked / totalItems * 100) }}%</span>
          </div>
          <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-slate-900 rounded-full transition-width duration-500" :style="{ width: (countChecked / totalItems * 100) + '%' }"></div>
          </div>
      </div>

      <!-- Dish Indicators Row (Horizontal Scroll) -->
      <div v-if="dishStats.length > 0" class="overflow-x-auto no-scrollbar flex gap-2 px-5 pb-3.5">
          <div
            v-for="dish in dishStats"
            :key="dish.id"
            class="h-9 pl-2 pr-3 min-w-[100px] max-w-[160px] rounded-full flex-shrink-0 border tap-effect flex items-center gap-1.5"
            :class="dish.percent >= 100 ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 shadow-sm'"
          >
              <span v-if="dish.percent >= 100" class="w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                  <span class="material-icons-round text-white" style="font-size: 11px;">check</span>
              </span>
              <svg v-else width="18" height="18" viewBox="0 0 18 18" class="shrink-0">
                  <circle cx="9" cy="9" r="7" fill="none" stroke="#E5E5EA" stroke-width="2.5"/>
                  <circle
                    cx="9" cy="9" r="7" fill="none" stroke="#1C1C1E" stroke-width="2.5"
                    stroke-linecap="round" transform="rotate(-90 9 9)"
                    :stroke-dasharray="43.98"
                    :stroke-dashoffset="43.98 * (1 - dish.percent / 100)"
                  />
              </svg>

              <!-- Dish Name -->
              <div class="text-[10px] font-bold truncate flex-1" :class="dish.percent >= 100 ? 'text-slate-400' : 'text-slate-700'">
                  {{ dish.name }}
              </div>

              <!-- Count Badge (Simple) -->
              <div v-if="dish.count > 1" class="text-[10px] font-bold shrink-0" :class="dish.percent >= 100 ? 'text-slate-300' : 'text-slate-400'">
                  x{{ dish.count }}
              </div>
          </div>
      </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
        <transition :name="transitionName">
            <div :key="activeTab" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-app-nav scroll-area w-full">
                
                <div v-if="totalItems === 0" class="empty-state-container -mt-10">
                    <div class="empty-state-icon">
                        <span class="material-icons-round" style="font-size: 64px;">shopping_basket</span>
                    </div>
                    <p class="empty-state-title">Список пуст</p>
                    <p class="empty-state-desc">Добавьте блюда в план или уберите галочки "Не покупать"</p>
                </div>

                <div v-else class="space-y-6">
                    <div v-for="(items, category) in groupedList" :key="category">
                        <h3 v-if="activeTab === 'departments'" class="text-[10px] font-bold text-slate-400 mb-3 ml-2 uppercase tracking-wider flex items-center gap-1.5">
                            <span class="text-sm not-italic">{{ getCategoryIcon(category) }}</span>
                            {{ category }}
                        </h3>
                        
                        <TransitionGroup name="list" tag="div" class="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden relative p-1 space-y-1">
                            <div 
                                v-for="item in items" 
                                :key="item.id" 
                                class="flex flex-col w-full bg-white transition-colors duration-200 rounded-xl"
                                :class="expandedProductIds.has(item.id) ? 'bg-slate-50/50' : ''"
                            >
                                <div class="flex items-center px-3 py-2.5 w-full min-h-[48px]">
                                    <!-- Checkbox Area -->
                                    <div 
                                        class="w-8 h-8 -ml-1 flex items-center justify-center cursor-pointer tap-effect rounded-full active:bg-slate-100 transition-colors flex-shrink-0"
                                        @click.stop="toggleCheck(item.id)"
                                    >
                                        <div 
                                            class="checkbox-custom" 
                                            :class="{ checked: checkedIds.has(item.id) }"
                                        >
                                            <span class="material-icons-round icon">check</span>
                                        </div>
                                    </div>
                                    
                                    <!-- Content Area (Expandable) -->
                                    <div class="flex-1 flex items-center cursor-pointer tap-effect min-w-0 h-full py-0.5 ml-2" @click="item.dishes.length ? toggleExpand(item.id) : toggleCheck(item.id)">
                                         <div class="flex-1 card-title transition-opacity duration-200 truncate pr-2 leading-tight" :class="checkedIds.has(item.id) ? 'opacity-30 line-through' : ''">
                                            {{ item.name }}
                                        </div>
                                        
                                        <div class="text-[10px] font-normal text-secondary bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 whitespace-nowrap flex-shrink-0" :class="checkedIds.has(item.id) ? 'opacity-30' : ''">
                                            {{ formatQuantity(item) }}
                                        </div>

                                        <span
                                            v-if="item.dishes.length > 0"
                                            class="material-icons-round text-base text-slate-300 shrink-0 ml-1 transition-transform duration-200"
                                            :class="expandedProductIds.has(item.id) ? 'rotate-180' : ''"
                                        >expand_more</span>
                                    </div>
                                </div>

                                <!-- Expansion Content -->
                                <CollapseTransition>
                                <div v-if="expandedProductIds.has(item.id) && item.dishes.length > 0" class="px-4 pb-3 pl-10">
                                    <div class="flex flex-wrap gap-1">
                                        <div v-for="dishName in item.dishes" :key="dishName" class="text-[9px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shadow-sm">
                                            {{ dishName }}
                                        </div>
                                    </div>
                                </div>
                                </CollapseTransition>
                            </div>
                        </TransitionGroup>
                    </div>
                </div>

            </div>
        </transition>
    </div>
  </div>
</template>
