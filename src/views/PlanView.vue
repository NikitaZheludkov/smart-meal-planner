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

const currentWeekStart = ref(getStartOfWeekFromSettings())
const selectedDate = ref(new Date())

uiStore.plan.currentWeekStart = currentWeekStart.value
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
        currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: newStartDay })
    }
})

const batchStatusMap = computed(() => {
    const map = new Map()
    const plan = planStore.plan
    const start = currentWeekStart.value
    const end = addDays(start, (settingsStore.periodLength || 7) - 1)
    
    // Фильтруем по текущей неделе и только batch блюда
    const weekItems = plan.filter(p => {
        if (!p.dish_id || !p.dishes?.is_batch) return false
        const d = parseISO(p.date)
        return isWithinInterval(d, { start, end })
    })

    // Группируем по dish_id
    const byDish = {}
    weekItems.forEach(item => {
        if (!byDish[item.dish_id]) byDish[item.dish_id] = []
        byDish[item.dish_id].push(item)
    })
    
    Object.values(byDish).forEach(items => {
        // Сортируем: дата, потом слот
        items.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date)
            return a.meal_type_id - b.meal_type_id
        })
        
        const yieldAmount = items[0].dishes.batch_yield || 1
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
    return p.date === dStr && p.meal_type_id === slotId
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
      if (type === 'dish') return existing.dish_id === item.id
      else return existing.product_id === item.id
  })

  if (isDuplicate) return 

  // Проверка для Batch-блюд
  if (type === 'dish' && item.is_batch) {
      const yieldAmount = item.batch_yield || 1
      const start = currentWeekStart.value
      const end = addDays(start, (settingsStore.periodLength || 7) - 1)
      
      // Считаем сколько уже запланировано
      const existingUses = planStore.plan.filter(p => 
        p.dish_id === item.id && 
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
  if (item.dish_id) {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    const fullDish = dishStore.dishes.find(d => d.id === item.dish_id)
    viewingDish.value = fullDish || item.dishes
    showDishModal.value = true
  }
}

const mealSlots = computed(() => dictionaries.mealTypes)

const loadData = async () => {
  // Грузим последовательно
  try { await planStore.fetchPlan() } catch(e) {}
  try { await dictionaries.fetchDictionaries() } catch(e) {}
  try { await settingsStore.fetchSettings() } catch(e) {}
  
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
      if (item.dish_id && item.dishes) {
        // Считаем КБЖУ только для одной порции (на 1 человека), игнорируем item.portions
        totals.kcal += (Number(item.dishes.kcal) || 0)
        totals.protein += (Number(item.dishes.protein) || 0)
        totals.fat += (Number(item.dishes.fat) || 0)
        totals.carbs += (Number(item.dishes.carbs) || 0)
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
      if (item.dish_id && item.dishes) {
        totals.kcal += (Number(item.dishes.kcal) || 0)
        totals.protein += (Number(item.dishes.protein) || 0)
        totals.fat += (Number(item.dishes.fat) || 0)
        totals.carbs += (Number(item.dishes.carbs) || 0)
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
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4">
      
      <!-- Tab Switcher -->
      <div class="bg-slate-100 p-1 rounded-full flex relative mb-4 h-10">
         <div class="absolute inset-y-1 w-1/2 bg-white rounded-full shadow-sm transition-all duration-300 ease-out" :class="uiStore.plan.activeTab === 'week' ? 'translate-x-full' : 'translate-x-0'"></div>
         <button @click="switchTab('day')" class="flex-1 relative z-10 text-xs font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'day' ? 'text-slate-900' : 'text-slate-400'">
             День
         </button>
         <button @click="switchTab('week')" class="flex-1 relative z-10 text-xs font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'week' ? 'text-slate-900' : 'text-slate-400'">
             Сетка
         </button>
      </div>

      <!-- Date Navigation -->
      <div class="flex items-center justify-between">
          <button @click="changePeriod(-1)" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
              <span class="material-icons-round">chevron_left</span>
          </button>
          
          <div class="flex flex-col items-center tap-effect" @click="goToToday">
              <div class="text-sm font-black text-slate-900 flex items-center gap-2">
                  {{ displayDateLabel }}
              </div>
              <div v-if="showTodayBtn" class="text-[10px] font-bold text-orange-500 mt-0.5">
                  Вернуться
              </div>
          </div>

          <button @click="changePeriod(1)" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
              <span class="material-icons-round">chevron_right</span>
          </button>
      </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
        <transition :name="transitionName">
            <div v-if="uiStore.plan.activeTab === 'day'" :key="'day-' + selectedDate.toISOString()" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-[76px] scroll-area w-full">
                <div v-if="dailyTotals.kcal > 0" class="bg-white border border-slate-100 p-3 rounded-2xl shadow-sm mb-4 flex justify-around items-center mx-1 mt-2">
                    <div class="text-center"><div class="text-sm font-black text-slate-700">{{ Math.round(dailyTotals.kcal) }}</div><div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ккал</div></div>
                    <div class="h-6 w-[1px] bg-slate-100"></div>
                    <div class="text-center"><div class="text-xs font-bold text-slate-700">{{ Math.round(dailyTotals.protein) }}</div><div class="text-[9px] font-bold text-slate-400 uppercase">Белки</div></div>
                    <div class="text-center"><div class="text-xs font-bold text-slate-700">{{ Math.round(dailyTotals.fat) }}</div><div class="text-[9px] font-bold text-slate-400 uppercase">Жиры</div></div>
                    <div class="text-center"><div class="text-xs font-bold text-slate-700">{{ Math.round(dailyTotals.carbs) }}</div><div class="text-[9px] font-bold text-slate-400 uppercase">Угле</div></div>
                </div>
                
                <div v-if="dailyTotals.kcal === 0 && currentDayData.every(g => !g.hasItems)" class="text-center py-20 opacity-40">
                    <div class="text-4xl mb-2">🍽️</div>
                    <p class="text-sm font-bold text-slate-400">День свободен</p>
                    <button @click="switchTab('week')" class="mt-4 text-indigo-500 font-bold text-xs bg-indigo-50 px-4 py-2 rounded-xl">Перейти к сетке</button>
                </div>

                <div class="space-y-6 mt-2">
                    <div v-for="group in currentDayData" :key="group.slot.id">
                        <transition name="fade">
                            <div v-if="group.hasItems">
                                <div class="flex items-center justify-between px-2 mb-2">
                                    <h3 class="font-black text-slate-900 text-sm uppercase tracking-wider">{{ group.slot.name }}</h3>
                                </div>
                                <TransitionGroup name="list" tag="div" class="space-y-2 relative">
                                    <div v-for="item in group.items" :key="item.id" @click="openDishDetails(item)" class="bg-white p-3 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 relative transition-transform w-full" :class="item.dish_id ? 'tap-effect active:scale-[0.98]' : ''">
                                        <div class="w-16 h-16 bg-slate-50 rounded-[18px] overflow-hidden flex-shrink-0 relative flex items-center justify-center text-2xl">
                                            <img v-if="item.dish_id && item.dishes?.image_url" :src="item.dishes.image_url" class="w-full h-full object-cover">
                                            <span v-else-if="item.product_id">🥦</span>
                                            <span v-else>{{ getSlotIcon(group.slot.name) }}</span>
                                        </div>
                                        <div class="flex-1 min-w-0 py-1">
                                            <div class="text-base font-bold text-slate-800 truncate leading-tight">
                                                {{ item.dish_id ? item.dishes?.name : item.products?.name }}
                                                <span v-if="item.portions > 1" class="text-indigo-500 ml-1">x{{ item.portions }}</span>
                                            </div>
                                            <!-- Batch Indicator List View -->
                                            <div v-if="batchStatusMap.has(item.id)" class="inline-flex items-center gap-1 mt-0.5 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                                                <span class="text-[9px] font-black text-indigo-500">Партия {{ batchStatusMap.get(item.id).batch }}</span>
                                                <span class="text-[9px] text-indigo-300">|</span>
                                                <span class="text-[9px] font-black text-indigo-700">{{ batchStatusMap.get(item.id).current }}/{{ batchStatusMap.get(item.id).total }}</span>
                                            </div>
                                            <div class="mt-1.5 flex flex-wrap gap-2">
                                                <template v-if="item.dish_id">
                                                    <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{{ item.dishes?.dish_type || 'Блюдо' }}</span>
                                                    <span class="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md">{{ item.dishes?.kcal }} ккал</span>
                                                </template>
                                                <template v-else>
                                                    <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{{ Number(item.portions) }} {{ item.products?.unit }}</span>
                                                </template>
                                            </div>
                                        </div>
                                        <div v-if="item.dish_id" class="text-slate-300 pr-1"><span class="material-icons-round text-lg">chevron_right</span></div>
                                    </div>
                                </TransitionGroup>
                            </div>
                        </transition>
                    </div>
                </div>
            </div>

            <div v-else :key="'week'" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-[76px] space-y-3 mt-2 scroll-area w-full">
                <div v-for="day in weekDays" :key="day" 
                    class="bg-white rounded-[24px] p-3 flex flex-col gap-2 transition-all duration-300"
                    :class="isToday(day) ? 'shadow-md ring-2 ring-orange-500/10 border-orange-200' : 'shadow-sm border border-slate-100'"
                >
                    
                    <div class="flex items-center justify-between pb-1.5 border-b" :class="isToday(day) ? 'border-orange-100' : 'border-slate-50'">
                        <div class="flex items-center gap-2">
                            <span class="text-base font-black" :class="isToday(day) ? 'text-orange-500' : 'text-slate-800'">{{ format(day, 'd') }}</span>
                            <span class="text-[10px] font-bold uppercase" :class="isToday(day) ? 'text-orange-400' : 'text-slate-500'">{{ format(day, 'EEEE', { locale: ru }) }}</span>
                        </div>

                        <div v-if="getDailyTotals(day).kcal > 0" class="flex items-center gap-2">
                            <div class="flex flex-col items-center">
                                <span class="text-[9px] font-black text-slate-800">{{ Math.round(getDailyTotals(day).kcal) }}</span>
                                <span class="text-[7px] font-bold text-slate-400 uppercase leading-none">ккал</span>
                            </div>
                            <div class="h-3 w-[1px] bg-slate-100"></div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).protein) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 uppercase leading-none">Б</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).fat) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 uppercase leading-none">Ж</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-[8px] font-bold text-slate-700">{{ Math.round(getDailyTotals(day).carbs) }}</span>
                                <span class="text-[6px] font-bold text-slate-400 uppercase leading-none">У</span>
                            </div>
                        </div>
                    </div>

                    <div class="w-full grid grid-cols-4 gap-1.5">
                    
                    <button 
                        v-for="slot in mealSlots" 
                        :key="slot.id" 
            @click="openSelector(day, slot)" 
            class="w-full h-20 rounded-xl border overflow-hidden relative tap-effect hover:bg-slate-50 flex flex-col transition-all bg-white shadow-sm border-slate-100" 
            :class="getSlotItems(day, slot.id).length === 0 ? 'bg-slate-50 border-slate-50 items-center justify-center' : ''"
          >
            <span v-if="getSlotItems(day, slot.id).length === 0" class="text-[7px] font-bold text-slate-300 uppercase text-center break-all px-1">
                {{ slot.name.substring(0, 3) }}
            </span>

            <template v-else-if="getSlotItems(day, slot.id).length === 1">
               <template v-if="getSlotItems(day, slot.id)[0].dish_id && getSlotItems(day, slot.id)[0].dishes?.image_url">
                    <img :src="getSlotItems(day, slot.id)[0].dishes.image_url" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-black/10 transition-colors" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'bg-red-500/30' : ''"></div>
                    <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent"></div>
                    <div class="absolute bottom-1.5 left-1.5 right-1.5 z-10 text-left">
                        <!-- Batch Indicator Grid View (Image) -->
                        <div v-if="batchStatusMap.has(getSlotItems(day, slot.id)[0].id)" class="absolute -top-16 right-0 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-white/10 flex items-center gap-1">
                             <span class="text-[8px] font-bold text-white">{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).current }}/{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).total }}</span>
                        </div>

                        <div class="text-[9px] font-bold text-white leading-tight line-clamp-2 shadow-sm">
                             <span v-if="getSlotItems(day, slot.id)[0].ignore_shopping" class="text-[8px] mr-1">🚫</span>
                            {{ getSlotItems(day, slot.id)[0].dishes?.name }}
                            <span v-if="getSlotItems(day, slot.id)[0].portions > 1" class="text-yellow-300 ml-0.5">x{{ getSlotItems(day, slot.id)[0].portions }}</span>
                         </div>
                    </div>
                </template>
                <template v-else>
                    <div class="absolute inset-0 flex flex-col items-center justify-center p-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'bg-red-50' : 'bg-white'">
                        <!-- Batch Indicator Grid View (No Image) -->
                        <div v-if="batchStatusMap.has(getSlotItems(day, slot.id)[0].id)" class="absolute top-1 right-1 bg-indigo-50 px-1 py-0.5 rounded-md border border-indigo-100">
                             <span class="text-[7px] font-black text-indigo-600">{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).current }}/{{ batchStatusMap.get(getSlotItems(day, slot.id)[0].id).total }}</span>
                        </div>
                        
                        <div class="text-xl mb-1">
                            {{ getSlotItems(day, slot.id)[0].product_id ? '🥦' : getSlotIcon(slot.name) }}
                        </div>
                        <div class="text-[9px] font-bold text-center leading-tight line-clamp-2 px-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'text-red-500 line-through' : 'text-slate-800'">
                            {{ getSlotItems(day, slot.id)[0].dish_id ? getSlotItems(day, slot.id)[0].dishes?.name : getSlotItems(day, slot.id)[0].products?.name }}
                        </div>
                        <div v-if="getSlotItems(day, slot.id)[0].portions > 1" class="text-[8px] font-black text-indigo-500">
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
                      :class="item.ignore_shopping ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'"
                   >
                      <span class="text-[7px] font-bold text-center leading-tight line-clamp-2 w-full break-words" :class="item.ignore_shopping ? 'text-red-500 line-through' : 'text-slate-700'">
                          {{ item.dish_id ? item.dishes?.name : item.products?.name }}
                          <span v-if="item.portions > 1" class="text-indigo-500"> x{{ item.portions }}</span>
                      </span>
                    </div>
                   
                   <div v-if="getSlotItems(day, slot.id).length > 3" class="h-2 w-full bg-slate-100 rounded-sm flex items-center justify-center">
                       <span class="text-[6px] font-bold text-slate-400">...</span>
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
