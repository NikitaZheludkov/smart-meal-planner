<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { startOfWeek, addDays, subDays, format, isToday, isSameDay, isWithinInterval, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { usePlanStore } from '../stores/plan'
import { useDictionariesStore } from '../stores/dictionaries'
import { useSettingsStore } from '../stores/settings'
import { useDishStore } from '../stores/dishes'
import { useUIStore } from '../stores/ui' 
import { useTelegramStore } from '../stores/telegram'
import DishSelector from '../components/DishSelector.vue'
import DishDetailModal from '../components/DishDetailModal.vue'

const auth = useAuthStore()
const planStore = usePlanStore()
const dictionaries = useDictionariesStore()
const settingsStore = useSettingsStore()
const dishStore = useDishStore()
const uiStore = useUIStore()
const telegram = useTelegramStore()

const transitionName = ref('slide-left')
const switchTab = (tab) => {
    if (uiStore.plan.activeTab === tab) return
    
    if (tab === 'week') {
        transitionName.value = 'slide-left'
    } else {
        transitionName.value = 'slide-right'
    }
    
    telegram.haptic.selection()
    uiStore.plan.activeTab = tab
}

// --- ИНИЦИАЛИЗАЦИЯ ДАТ ---
const getStartOfWeekFromSettings = () => {
    const day = settingsStore.startDay ?? 1
    return startOfWeek(new Date(), { weekStartsOn: day })
}

// Инициализируем дату из uiStore, чтобы сохранить состояние при навигации
const getInitialDate = () => {
    let date
    if (uiStore.plan.currentWeekStart) {
        // Проверка на валидность даты (не Invalid Date)
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
const selectedDate = ref(new Date())

// Синхронизация с UI Store
watch(currentWeekStart, (newVal) => {
    uiStore.plan.currentWeekStart = newVal
}, { immediate: true })

uiStore.plan.selectedDate = selectedDate.value

// --- НАСТРОЙКИ (ПОРЦИИ) ---
// Берем значение напрямую из стора настроек
const defaultPortions = computed(() => {
    return Number(settingsStore.defaultPortions) || 1
})

const showSelector = ref(false)
const targetSlot = ref({
    dateObj: null,      
    dateStr: '',        
    slotId: null,       
    yesterdayItems: []  
})

watch(() => settingsStore.startDay, (newStartDay) => {
    if (newStartDay !== undefined && newStartDay !== null) {
        currentWeekStart.value = startOfWeek(currentWeekStart.value, { weekStartsOn: newStartDay })
    }
})

const batchStatusMap = computed(() => {
    const map = new Map()
    const plan = planStore.plan
    const start = currentWeekStart.value
    const end = addDays(start, (settingsStore.periodLength || 7) - 1)
    
    // Фильтруем по текущей неделе и только batch блюда (где yield > 1)
    const weekItems = plan.filter(p => {
        if (!p.dish) return false
        // Если yield > 1, считаем это batch-блюдом
        const yieldAmount = p.dishData?.batch_yield || 1
        if (yieldAmount <= 1) return false
        
        const d = parseISO(p.date)
        return isWithinInterval(d, { start, end })
    })

    const sortOrderByMealType = new Map((dictionaries.mealTypes || []).map((m) => [m.id, Number(m.sort_order) || 0]))

    // Группируем по dish
    const byDish = {}
    weekItems.forEach(item => {
        if (!byDish[item.dish]) byDish[item.dish] = []
        byDish[item.dish].push(item)
    })
    
    Object.values(byDish).forEach(items => {
        // Сортируем: дата, потом слот
        items.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date)
            return (sortOrderByMealType.get(a.meal_type) || 0) - (sortOrderByMealType.get(b.meal_type) || 0)
        })
        
        const yieldAmount = items[0].dishData.batch_yield || 1
        let currentBatch = 1
        let usedInBatch = 0
        
        items.forEach(item => {
            const portions = item.portions || 1
            usedInBatch += portions
            
            while (usedInBatch > yieldAmount) {
                currentBatch++
                usedInBatch -= yieldAmount
            }
            
            map.set(item.id, {
                current: usedInBatch,
                total: yieldAmount,
                batch: currentBatch
            })
        })
    })
    
    return map
})

const getSlotIcon = (slotName) => {
    if (!slotName) return '🥘'
    const name = slotName.toLowerCase()
    if (name.includes('завтрак')) return '🍳'
    if (name.includes('обед')) return '🍲'
    if (name.includes('ужин')) return '🍗'
    if (name.includes('перекус') || name.includes('полдник')) return '🥪'
    return '🥘'
}

const getSlotItems = (date, slotId) => {
  if (!date) return []
  const dStr = format(date, 'yyyy-MM-dd')
  
  return planStore.plan.filter(p => {
    return p.date === dStr && p.meal_type === slotId
  })
}

const openSelector = (date, slot) => {
  const prevDate = subDays(date, 1)
  const prevItems = getSlotItems(prevDate, slot.id)

  targetSlot.value = { 
    dateObj: date, 
    dateStr: format(date, 'yyyy-MM-dd'), 
    slotId: slot.id,
    yesterdayItems: prevItems 
  }
  
  showSelector.value = true
}

// --- ОБРАБОТКА ВЫБОРА ---
const onDishSelected = async ({ item, type }) => {
  if (!targetSlot.value.dateObj || !targetSlot.value.slotId) return

  const currentItems = getSlotItems(targetSlot.value.dateObj, targetSlot.value.slotId)

  // Проверка на дубликаты
  const isDuplicate = currentItems.some(existing => {
      if (type === 'dish') return existing.dish === item.id
      else return existing.product === item.id
  })

  if (isDuplicate) return 

  // Проверка для Batch-блюд (где yield > 1)
  const yieldAmount = item.batch_yield || 1
  if (type === 'dish' && yieldAmount > 1) {
      const start = currentWeekStart.value
      const end = addDays(start, (settingsStore.periodLength || 7) - 1)
      
      // Считаем сколько уже запланировано
      const existingUses = planStore.plan.filter(p => 
        p.dish === item.id && 
        isWithinInterval(parseISO(p.date), { start, end })
      )
      
      const totalUsed = existingUses.reduce((sum, p) => sum + (p.portions || 1), 0)
      const adding = defaultPortions.value // Используем вычисленное значение
      
      const currentBatchCount = Math.ceil((totalUsed || 1) / yieldAmount)
      const newTotal = totalUsed + adding
      const newBatchCount = Math.ceil(newTotal / yieldAmount)
      
      // Если мы переходим границу батча (начинаем новый)
      if (newBatchCount > currentBatchCount && totalUsed > 0) {
          const confirmMsg = `Блюдо закончится. Добавить новую готовку?`
          if (!confirm(confirmMsg)) return
      }
  }

  // Берем значение из настроек
  const portionsToAdd = defaultPortions.value

  // Формируем данные для отправки в planStore
  const payload = { 
      ...item, 
      type,
      portions: portionsToAdd 
  }
  
  await planStore.addToPlan(targetSlot.value.dateStr, targetSlot.value.slotId, payload)
}

const showDishModal = ref(false)
const viewingDish = ref(null)

const openDishDetails = async (item) => {
  telegram.haptic.impact('light')
  if (item.dish) {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    const fullDish = dishStore.dishes.find(d => d.id === item.dish)
    viewingDish.value = fullDish || item.dishData
    showDishModal.value = true
  }
}

const mealSlots = computed(() => dictionaries.mealTypes)
const dishTypeNameById = computed(() => new Map((dictionaries.dishTypes || []).map((t) => [t.id, t.name])))

const loadData = async () => {
  // Грузим последовательно
  try { await planStore.fetchPlan() } catch(e) {}
  try { await dictionaries.fetchDictionaries() } catch(e) {}
  try { 
      await settingsStore.fetchSettings()
      // Force re-alignment after fetching settings to ensure grid matches user preference
      const day = settingsStore.startDay ?? 1
      const current = currentWeekStart.value
      const aligned = startOfWeek(current, { weekStartsOn: day })
      if (!isSameDay(current, aligned)) {
          currentWeekStart.value = aligned
      }
  } catch(e) {}
  
  if (dishStore.dishes.length === 0) {
      try { await dishStore.fetchDishes() } catch(e) {}
  }
}

const weekDays = computed(() => {
  const length = settingsStore.periodLength || 7
  return Array.from({ length }, (_, i) => addDays(currentWeekStart.value, i))
})

const currentDayData = computed(() => {
  return mealSlots.value.map(slot => {
    const items = getSlotItems(selectedDate.value, slot.id)
    return { slot, items, hasItems: items.length > 0 }
  })
})

const dailyTotals = computed(() => {
  let totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  currentDayData.value.forEach(group => {
    group.items.forEach(item => {
      if (item.dish && item.dishData) {
        // Считаем КБЖУ только для одной порции (на 1 человека), игнорируем item.portions
        totals.kcal += (Number(item.dishData.kcal) || 0)
        totals.protein += (Number(item.dishData.protein) || 0)
        totals.fat += (Number(item.dishData.fat) || 0)
        totals.carbs += (Number(item.dishData.carbs) || 0)
      }
    })
  })
  return totals
})

const getDailyTotals = (day) => {
  let totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  mealSlots.value.forEach(slot => {
    const items = getSlotItems(day, slot.id)
    items.forEach(item => {
      if (item.dish && item.dishData) {
        totals.kcal += (Number(item.dishData.kcal) || 0)
        totals.protein += (Number(item.dishData.protein) || 0)
        totals.fat += (Number(item.dishData.fat) || 0)
        totals.carbs += (Number(item.dishData.carbs) || 0)
      }
    })
  })
  return totals
}

const displayDateLabel = computed(() => {
  if (uiStore.plan.activeTab === 'day') {
    return format(selectedDate.value, 'd MMMM, EEEE', { locale: ru })
  } else {
    const length = settingsStore.periodLength || 7
    const start = currentWeekStart.value
    const end = addDays(start, length - 1)
    return `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`
  }
})

const showTodayBtn = computed(() => {
  if (uiStore.plan.activeTab === 'day') return !isToday(selectedDate.value)
  const userStartDay = settingsStore.startDay ?? 1
  const realCurrentWeekStart = startOfWeek(new Date(), { weekStartsOn: userStartDay })
  return !isSameDay(currentWeekStart.value, realCurrentWeekStart)
})

const goToToday = () => {
  const today = new Date()
  const userStartDay = settingsStore.startDay ?? 1
  currentWeekStart.value = startOfWeek(today, { weekStartsOn: userStartDay })
  selectedDate.value = today
}

const changePeriod = (direction) => {
  transitionName.value = direction > 0 ? 'slide-left' : 'slide-right'
  if (uiStore.plan.activeTab === 'day') {
      selectedDate.value = addDays(selectedDate.value, direction)
  } else {
      const length = settingsStore.periodLength || 7
      currentWeekStart.value = addDays(currentWeekStart.value, direction * length)
  }
}

watch(() => auth.isAuth, (val) => { if (val) loadData() })
onMounted(() => { if (auth.isAuth) loadData() })
</script>

<template>
  <div class="flex flex-col h-full bg-slate-50 relative">

    <!-- Header with Date and View Switcher -->
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4 h-[165px] flex flex-col justify-between">
      
      <!-- Date Navigation & Switcher Row -->
      <div class="flex items-center justify-between">
          <div class="flex flex-col tap-effect min-h-[50px] justify-center" @click="goToToday">
              <div class="app-title !mb-0 text-2xl flex items-center gap-2 leading-none">
                  {{ displayDateLabel }}
              </div>
              <div v-if="showTodayBtn" class="text-[10px] font-bold text-slate-900 mt-1">
                  Вернуться
              </div>
          </div>

          <div class="flex items-center gap-1">
            <button @click="changePeriod(-1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-transform tap-effect">
                <span class="material-icons-outlined text-xl">chevron_left</span>
            </button>
            <button @click="changePeriod(1)" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-transform tap-effect">
                <span class="material-icons-round text-xl">chevron_right</span>
            </button>
          </div>
      </div>

      <!-- Tab Switcher (Smaller) -->
      <div class="bg-slate-100 p-0.5 rounded-xl flex relative h-9 shrink-0">
         <div class="absolute inset-y-0.5 w-1/2 bg-white rounded-[10px] shadow-sm transition-transform duration-300 ease-out" :class="uiStore.plan.activeTab === 'week' ? 'translate-x-full' : 'translate-x-0'"></div>
         <button @click="switchTab('day')" class="flex-1 relative z-10 text-[11px] font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'day' ? 'text-slate-900' : 'text-slate-400'">
             День
         </button>
         <button @click="switchTab('week')" class="flex-1 relative z-10 text-[11px] font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'week' ? 'text-slate-900' : 'text-slate-400'">
             Сетка
         </button>
      </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
        <transition :name="transitionName">
            <div v-if="uiStore.plan.activeTab === 'day'" :key="'day-' + selectedDate.toISOString()" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-app-nav scroll-area w-full">
                <div v-if="dailyTotals.kcal > 0" class="card-accent-inverse p-4 rounded-[24px] mb-4 flex justify-around items-center mx-1 mt-2">
                    <div class="text-center">
                        <div class="text-lg font-black text-white">{{ Math.round(dailyTotals.kcal) }}</div>
                        <div class="text-[9px] font-bold text-white/60">ккал</div>
                    </div>
                    <div class="h-8 w-[1px] bg-white/10"></div>
                    <div class="text-center">
                        <div class="text-sm font-bold text-white">{{ Math.round(dailyTotals.protein) }}</div>
                        <div class="text-[9px] font-bold text-white/60">Белки</div>
                    </div>
                    <div class="text-center">
                        <div class="text-sm font-bold text-white">{{ Math.round(dailyTotals.fat) }}</div>
                        <div class="text-[9px] font-bold text-white/60">Жиры</div>
                    </div>
                    <div class="text-center">
                        <div class="text-sm font-bold text-white">{{ Math.round(dailyTotals.carbs) }}</div>
                        <div class="text-[9px] font-bold text-white/60">Угле</div>
                    </div>
                </div>
                
                <div v-if="dailyTotals.kcal === 0 && currentDayData.every(g => !g.hasItems)" class="empty-state-container">
                    <div class="empty-state-icon">
                        <span class="material-icons-round" style="font-size: 64px;">restaurant</span>
                    </div>
                    <p class="empty-state-title">День свободен</p>
                    <button @click="switchTab('week')" class="mt-4 btn-secondary text-xs px-4 py-2">Перейти к сетке</button>
                </div>

                <div class="space-y-6 mt-2">
                    <div v-for="group in currentDayData" :key="group.slot.id">
                        <transition name="fade">
                            <div v-if="group.hasItems">
                                <div class="flex items-center justify-between px-2 mb-2">
                                    <h3 class="card-title text-lg">{{ group.slot.name }}</h3>
                                    <button @click="openSelector(selectedDate, group.slot)" class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 active:scale-90 transition-transform tap-effect">
                                        <span class="material-icons-round text-lg">add</span>
                                    </button>
                                </div>
                                <TransitionGroup name="list" tag="div" class="space-y-3 relative">
                                    <div v-for="item in group.items" :key="item.id" @click="openDishDetails(item)" class="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 relative transition-transform w-full" :class="item.dish ? 'tap-effect active:scale-[0.98]' : ''">
                                        <div class="w-16 h-16 bg-slate-50 rounded-[20px] overflow-hidden flex-shrink-0 relative flex items-center justify-center text-2xl">
                                            <img v-if="item.dish && item.dishData?.image_url" :src="item.dishData.image_url" class="w-full h-full object-cover">
                                            <span v-else-if="item.product">🥦</span>
                                            <span v-else>{{ getSlotIcon(group.slot.name) }}</span>
                                        </div>
                                        <div class="flex-1 min-w-0 py-1">
                                            <div class="text-base card-title truncate leading-tight">
                                                {{ item.dish ? item.dishData?.name : item.productData?.name }}
                                                <span v-if="item.portions > 1" class="text-indigo-500 ml-1">x{{ item.portions }}</span>
                                            </div>
                                            <!-- Batch Indicator List View -->
                                            <div v-if="batchStatusMap.has(item.id)" class="inline-flex items-center gap-1 mt-0.5 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                                                <span class="text-[9px] font-black text-slate-900">Партия {{ batchStatusMap.get(item.id).batch }}</span>
                                                <span class="text-[9px] text-slate-400">|</span>
                                                <span class="text-[9px] font-black text-slate-600">{{ batchStatusMap.get(item.id).current }}/{{ batchStatusMap.get(item.id).total }}</span>
                                            </div>
                                            <div class="mt-1.5 flex flex-wrap gap-2">
                                                <template v-if="item.dish">
                                                    <span class="text-[10px] font-normal text-secondary bg-slate-100 px-2 py-0.5 rounded-md">{{ dishTypeNameById.get(item.dishData?.dish_type) || 'Блюдо' }}</span>
                                                    <span class="text-[10px] font-normal text-slate-900 bg-slate-200 px-2 py-0.5 rounded-md">{{ item.dishData?.kcal }} ккал</span>
                                                </template>
                                                <template v-else>
                                                    <span class="text-[10px] font-normal text-slate-900 bg-slate-200 px-2 py-0.5 rounded-md">{{ Number(item.portions) }} {{ item.productData?.unit }}</span>
                                                </template>
                                            </div>
                                        </div>
                                        <div v-if="item.dish" class="text-slate-300 pr-1"><span class="material-icons-round text-lg">chevron_right</span></div>
                                    </div>
                                </TransitionGroup>
                            </div>
                        </transition>
                    </div>
                </div>
            </div>

            <div v-else :key="'week'" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-app-nav space-y-3 mt-2 scroll-area w-full">
                <div v-for="day in weekDays" :key="day" 
                    class="bg-white rounded-[24px] p-3 flex flex-col gap-2 transition-colors duration-300"
                    :class="isToday(day) ? 'shadow-md ring-2 ring-slate-900/5 border-slate-900' : 'shadow-sm border border-slate-100'"
                >
                    
                    <div class="flex items-center justify-between pb-1.5 border-b" :class="isToday(day) ? 'border-slate-200' : 'border-slate-50'">
                        <div class="flex items-center gap-2">
                            <span class="text-base font-black" :class="isToday(day) ? 'text-slate-900' : 'text-slate-800'">{{ format(day, 'd') }}</span>
                            <span class="text-[10px] font-bold" :class="isToday(day) ? 'text-slate-900' : 'text-slate-500'">{{ format(day, 'EEEE', { locale: ru }) }}</span>
                        </div>

                        <div v-if="getDailyTotals(day).kcal > 0" class="flex items-center gap-2">
                            <div class="flex flex-col items-center">
                                <span class="text-[9px] font-black text-slate-800">{{ Math.round(getDailyTotals(day).kcal) }}</span>
                                <span class="text-[7px] font-bold text-slate-400 leading-none">ккал</span>
                            </div>
                            <div class="h-3 w-[1px] bg-slate-100"></div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).protein) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 leading-none">Б</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).fat) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 leading-none">Ж</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).carbs) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 leading-none">У</span>
                            </div>
                        </div>
                    </div>

                    <div class="w-full grid grid-cols-4 gap-1.5">
                    
                    <button 
                        v-for="slot in mealSlots" 
                        :key="slot.id" 
            @click="openSelector(day, slot)" 
            class="w-full h-20 rounded-xl border overflow-hidden relative tap-effect hover:bg-slate-50 flex flex-col transition-colors bg-white shadow-sm border-slate-100" 
            :class="getSlotItems(day, slot.id).length === 0 ? 'bg-slate-50 border-slate-50 items-center justify-center' : ''"
          >
            <span v-if="getSlotItems(day, slot.id).length === 0" class="text-[7px] font-bold text-slate-300 text-center break-all px-1">
                {{ slot.name.substring(0, 3) }}
            </span>

            <template v-else-if="getSlotItems(day, slot.id).length === 1">
               <template v-if="getSlotItems(day, slot.id)[0].dish && getSlotItems(day, slot.id)[0].dishData?.image_url">
                    <img :src="getSlotItems(day, slot.id)[0].dishData.image_url" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-black/10 transition-colors" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'bg-slate-900/40 grayscale' : ''"></div>
                    <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent"></div>
                    <div class="absolute bottom-1.5 left-1.5 right-1.5 z-10 text-left">
                        <!-- Batch Indicator Grid View (Image) -->
                        <div v-if="batchStatusMap.has(getSlotItems(day, slot.id)[0].id)" class="absolute -top-16 right-0 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-white/10 flex items-center gap-1">
                             <span class="text-[8px] font-bold text-white">{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).current }}/{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).total }}</span>
                        </div>

                        <div class="text-[9px] font-bold text-white leading-tight line-clamp-2 shadow-sm">
                             <span v-if="getSlotItems(day, slot.id)[0].ignore_shopping" class="text-[8px] mr-1 opacity-70">🚫</span>
                            {{ getSlotItems(day, slot.id)[0].dishData?.name }}
                            <span v-if="getSlotItems(day, slot.id)[0].portions > 1" class="text-white/80 ml-0.5">x{{ getSlotItems(day, slot.id)[0].portions }}</span>
                         </div>
                    </div>
                </template>
                <template v-else>
                    <div class="absolute inset-0 flex flex-col items-center justify-center p-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'bg-slate-100' : 'bg-white'">
                        <!-- Batch Indicator Grid View (No Image) -->
                        <div v-if="batchStatusMap.has(getSlotItems(day, slot.id)[0].id)" class="absolute top-1 right-1 bg-slate-100 px-1 py-0.5 rounded-md border border-slate-200">
                             <span class="text-[7px] font-black text-slate-900">{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).current }}/{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).total }}</span>
                        </div>
                        
                        <div class="text-xl mb-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'opacity-30' : ''">
                            {{ getSlotItems(day, slot.id)[0].product ? '🥦' : getSlotIcon(slot.name) }}
                        </div>
                        <div class="text-[9px] font-bold text-center leading-tight line-clamp-2 px-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'text-slate-400 line-through' : 'text-slate-800'">
                            {{ getSlotItems(day, slot.id)[0].dish ? getSlotItems(day, slot.id)[0].dishData?.name : getSlotItems(day, slot.id)[0].productData?.name }}
                        </div>
                        <div v-if="getSlotItems(day, slot.id)[0].portions > 1" class="text-[8px] font-black text-slate-900">
                              x{{ getSlotItems(day, slot.id)[0].portions }}
                        </div>
                    </div>
                </template>
            </template>

            <template v-else>
               <div class="flex flex-col w-full h-full p-1 gap-1">
                   <div 
                      v-for="(item, idx) in getSlotItems(day, slot.id).slice(0, 3)" 
                      :key="item.id" 
                      class="flex-1 w-full rounded-lg border flex items-center justify-center px-1 overflow-hidden"
                      :class="item.ignore_shopping ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-slate-100'"
                   >
                      <span class="text-[7px] font-bold text-center leading-tight line-clamp-2 w-full break-words" :class="item.ignore_shopping ? 'text-slate-400 line-through' : 'text-slate-700'">
                          {{ item.dish ? item.dishData?.name : item.productData?.name }}
                          <span v-if="item.portions > 1" class="text-slate-900"> x{{ item.portions }}</span>
                      </span>
                    </div>
                   
                   <div v-if="getSlotItems(day, slot.id).length > 3" class="h-2 w-full bg-slate-100 rounded-sm flex items-center justify-center">
                       <span class="material-icons-round text-[10px] text-slate-300">more_horiz</span>
                    </div>
               </div>
            </template>

          </button>
        </div>
      </div>
    </div>
        </transition>
    </div>

    <DishSelector 
        v-if="showSelector" 
        :is-open="showSelector"
        :selected-date="targetSlot.dateObj"
        :slot-id="targetSlot.slotId"
        :existing-items="targetSlot.dateObj ? getSlotItems(targetSlot.dateObj, targetSlot.slotId) : []"
        :yesterday-items="targetSlot.yesterdayItems"
        @close="showSelector = false" 
        @select="onDishSelected" 
    />

    <DishDetailModal :is-open="showDishModal" :dish="viewingDish" @close="showDishModal = false" />
  </div>
</template>

<style scoped>
/* Scoped styles removed, using global transitions */
</style>
