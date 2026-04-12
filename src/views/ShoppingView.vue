<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import { useSettingsStore } from '../stores/settings'
import { useShoppingStore } from '../stores/shopping' // <-- Added
import { useTelegramStore } from '../stores/telegram'
import { useUIStore } from '../stores/ui'
import { startOfWeek, addDays, format, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

const planStore = usePlanStore()
const settingsStore = useSettingsStore()
const shoppingStore = useShoppingStore() // <-- Added
const telegram = useTelegramStore()
const uiStore = useUIStore()

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
    return `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`
})

const changePeriod = (dir) => {
    telegram.haptic.selection()
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
    telegram.haptic.selection()
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
    telegram.haptic.impact('medium')
    const newState = !shoppingStore.isChecked(id)
    shoppingStore.toggleProduct(id, newState)
}

const expandedProductIds = ref(new Set())
const toggleExpand = (id) => {
    if (expandedProductIds.value.has(id)) expandedProductIds.value.delete(id)
    else {
        expandedProductIds.value.add(id)
        telegram.haptic.selection()
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
        return groups
    } else {
        return { 'Все': items.sort(sorter) }
    }
})

const totalItems = computed(() => shoppingList.value.length)
const countChecked = computed(() => shoppingList.value.filter(i => checkedIds.value.has(i.id)).length)

const switchViewTab = (mode) => {
    if(activeTab.value !== mode) {
        transitionName.value = mode === 'departments' ? 'slide-left' : 'slide-right'
        telegram.haptic.selection()
        activeTab.value = mode
    }
}
const resetChecks = () => {
    if (confirm('Снять все отметки?')) {
        shoppingStore.clearList() // Use store action
        telegram.haptic.impact('medium')
    }
}

const copyList = () => {
    const text = shoppingList.value
        .map(item => `${item.name} - ${formatAmount(item.amount)} ${item.unit}`)
        .join('\n')
    
    navigator.clipboard.writeText(text).then(() => {
        telegram.haptic.notification('success')
        alert('Список скопирован!')
    })
}

const formatAmount = (val) => {
    if (Number.isInteger(val)) return val
    return parseFloat(val.toFixed(3))
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-10 relative overflow-hidden flex flex-col border-b border-slate-100">
      
      <div class="px-5 pt-app-header pb-3 flex flex-col gap-3">
          
        <!-- Header Row -->
        <div class="flex items-center justify-between">
            <h1 class="app-title mb-0">Купить</h1>
            
            <div class="flex items-center gap-1">
                <button @click="changePeriod(-1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
                    <span class="material-icons-outlined text-xl">chevron_left</span>
                </button>
                <button @click="changePeriod(1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
                    <span class="material-icons-round text-xl">chevron_right</span>
                </button>
            </div>
        </div>

        <!-- Date Info & Today Btn -->
        <div class="flex items-center justify-between px-1">
            <div class="flex flex-col tap-effect" @click="goToToday">
                <div class="text-sm font-black text-slate-900 flex items-center gap-2">
                    {{ periodLabel }}
                </div>
                <div v-if="showTodayBtn" class="text-[10px] font-bold text-slate-900 mt-0.5">
                    Вернуться
                </div>
            </div>
        </div>

        <!-- Controls Row (Smaller) -->
        <div class="flex items-center gap-2 w-full h-9">
            <!-- View Switcher -->
            <div class="flex-[2] bg-slate-50 border border-slate-100 p-0.5 rounded-xl flex items-center h-full">
                <button @click="switchViewTab('list')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-all" :class="activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-base">format_list_bulleted</span>
                </button>
                <button @click="switchViewTab('departments')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-all" :class="activeTab === 'departments' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
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

      <div v-if="dishStats.length > 0" class="pl-5 pb-4 overflow-x-auto no-scrollbar flex gap-2">
          <div 
            v-for="dish in dishStats" 
            :key="dish.id"
            class="relative w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden shadow-sm border border-slate-100 bg-white tap-effect flex items-center justify-center p-0.5"
          >
              <!-- Dish Name -->
              <div class="text-[7px] font-normal text-center leading-tight text-secondary line-clamp-4 break-words w-full pb-1">
                  {{ dish.name }}
              </div>
              
              <!-- Progress Overlay (Bottom Bar) -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                  <div 
                    class="h-full transition-all duration-500 bg-slate-900" 
                    :style="{ width: dish.percent + '%' }"
                  ></div>
              </div>

              <!-- Count Badge -->
              <div v-if="dish.count > 1" class="absolute top-0 right-0 bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg shadow-sm leading-none z-10">
                  x{{ dish.count }}
              </div>
          </div>
      </div>

      <div class="h-1 w-full bg-slate-100">
          <div class="h-full bg-slate-900 transition-all duration-500" :style="{ width: (totalItems > 0 ? (countChecked / totalItems * 100) : 0) + '%' }"></div>
      </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
        <transition :name="transitionName">
            <div :key="activeTab" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-[76px] scroll-area w-full">
                
                <div v-if="totalItems === 0" class="empty-state-container -mt-10">
                    <div class="empty-state-icon">
                        <span class="material-icons-round" style="font-size: 64px;">shopping_basket</span>
                    </div>
                    <p class="empty-state-title">Список пуст</p>
                    <p class="empty-state-desc">Добавьте блюда в план или уберите галочки "Не покупать"</p>
                </div>

                <div v-else class="space-y-6">
                    <div v-for="(items, category) in groupedList" :key="category">
                        <h3 v-if="activeTab === 'departments'" class="text-xs font-black text-slate-400 mb-3 ml-2">{{ category }}</h3>
                        
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
                                         <div class="flex-1 card-title transition-all duration-200 truncate pr-2 leading-tight" :class="checkedIds.has(item.id) ? 'opacity-30 line-through' : ''">
                                            {{ item.name }}
                                        </div>
                                        
                                        <div class="text-[10px] font-normal text-secondary bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 whitespace-nowrap flex-shrink-0" :class="checkedIds.has(item.id) ? 'opacity-30' : ''">
                                            {{ formatAmount(item.amount) }} {{ item.unit }}
                                        </div>
                                    </div>
                                </div>

                                <!-- Expansion Content -->
                                <div v-if="expandedProductIds.has(item.id) && item.dishes.length > 0" class="px-4 pb-3 pl-10">
                                    <div class="flex flex-wrap gap-1">
                                        <div v-for="dishName in item.dishes" :key="dishName" class="text-[9px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shadow-sm">
                                            {{ dishName }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TransitionGroup>
                    </div>
                </div>

            </div>
        </transition>
    </div>
  </div>
</template>
