<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { startOfWeek, addDays, subDays, format, isToday, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { usePlanStore } from '../stores/plan'
import { useDictionariesStore } from '../stores/dictionaries'
import { useSettingsStore } from '../stores/settings'
import { useDishStore } from '../stores/dishes'
import { useUIStore } from '../stores/ui' 
import DishSelector from '../components/DishSelector.vue'
import DishDetailModal from '../components/DishDetailModal.vue'

const auth = useAuthStore()
const planStore = usePlanStore()
const dictionaries = useDictionariesStore()
const settingsStore = useSettingsStore()
const dishStore = useDishStore()
const uiStore = useUIStore()

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
  if (item.dish_id) {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    const fullDish = dishStore.dishes.find(d => d.id === item.dish_id)
    viewingDish.value = fullDish || item.dishes
    showDishModal.value = true
  }
}

const mealSlots = computed(() => dictionaries.mealTypes)

const loadData = async () => {
  await Promise.all([
      planStore.fetchPlan(),
      dictionaries.fetchDictionaries(),
      settingsStore.fetchSettings() 
  ])
  
  if (dishStore.dishes.length === 0) dishStore.fetchDishes()
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
        const mult = item.portions || 1
        totals.kcal += (Number(item.dishes.kcal) || 0) * mult
        totals.protein += (Number(item.dishes.protein) || 0) * mult
        totals.fat += (Number(item.dishes.fat) || 0) * mult
        totals.carbs += (Number(item.dishes.carbs) || 0) * mult
      }
    })
  })
  return totals
})

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
    <div class="pt-14 pb-2 px-4 bg-white z-20 shrink-0 shadow-sm border-b border-slate-50">
      <div class="flex justify-between items-center mb-4">
        <div>
           <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">План питания</div>
           <div class="text-xl font-black text-slate-900 flex items-center gap-2 tap-effect" @click="goToToday">
              {{ displayDateLabel }}
              <div v-if="showTodayBtn" class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
           </div>
        </div>
        <div class="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
           <button @click="changePeriod(-1)" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 active:scale-90 transition-transform tap-effect">
               <span class="material-icons-round">chevron_left</span>
           </button>
           <button @click="changePeriod(1)" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 active:scale-90 transition-transform tap-effect">
               <span class="material-icons-round">chevron_right</span>
           </button>
        </div>
      </div>

      <div class="bg-slate-100 p-1 rounded-xl flex relative">
         <div class="absolute inset-y-1 w-1/2 bg-white rounded-lg shadow-sm transition-all duration-300 ease-out" :class="uiStore.plan.activeTab === 'week' ? 'translate-x-full' : 'translate-x-0'"></div>
         <button @click="uiStore.plan.activeTab = 'day'" class="flex-1 relative z-10 py-1.5 text-xs font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'day' ? 'text-slate-900' : 'text-slate-400'">
             День
         </button>
         <button @click="uiStore.plan.activeTab = 'week'" class="flex-1 relative z-10 py-1.5 text-xs font-bold text-center transition-colors tap-effect" :class="uiStore.plan.activeTab === 'week' ? 'text-slate-900' : 'text-slate-400'">
             Сетка
         </button>
      </div>
    </div>

    <div v-if="uiStore.plan.activeTab === 'day'" class="flex-1 overflow-y-auto pb-20 pt-2 px-4">
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
         <button @click="uiStore.plan.activeTab = 'week'" class="mt-4 text-indigo-500 font-bold text-xs bg-indigo-50 px-4 py-2 rounded-xl">Перейти к сетке</button>
      </div>

      <div class="space-y-6 mt-2">
        <div v-for="group in currentDayData" :key="group.slot.id">
            <div v-if="group.hasItems">
                <div class="flex items-center justify-between px-2 mb-2">
                    <h3 class="font-black text-slate-900 text-sm uppercase tracking-wider">{{ group.slot.name }}</h3>
                </div>
                <div class="space-y-2">
                    <div v-for="item in group.items" :key="item.id" @click="openDishDetails(item)" class="bg-white p-3 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 relative transition-transform" :class="item.dish_id ? 'tap-effect active:scale-[0.98]' : ''">
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
                 </div>
            </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto pb-20 pt-2 px-4 space-y-3 mt-2">
      <div v-for="day in weekDays" :key="day" class="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100 flex items-stretch gap-4">
        
        <div class="flex flex-col items-center justify-center w-8 flex-shrink-0 border-r border-slate-50 pr-3">
           <span class="text-lg font-black text-slate-800">{{ format(day, 'd') }}</span>
          <span class="text-[9px] font-bold uppercase" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">{{ format(day, 'EEE', { locale: ru }) }}</span>
        </div>

        <div class="flex-1 grid grid-cols-4 gap-2">
          
          <button 
            v-for="slot in mealSlots" 
            :key="slot.id" 
            @click="openSelector(day, slot)" 
            class="w-full h-28 rounded-2xl border overflow-hidden relative tap-effect hover:bg-slate-50 flex flex-col transition-all bg-white shadow-sm border-slate-100" 
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
                        <div class="text-[9px] font-bold text-white leading-tight line-clamp-2 shadow-sm">
                             <span v-if="getSlotItems(day, slot.id)[0].ignore_shopping" class="text-[8px] mr-1">🚫</span>
                            {{ getSlotItems(day, slot.id)[0].dishes?.name }}
                            <span v-if="getSlotItems(day, slot.id)[0].portions > 1" class="text-yellow-300 ml-0.5">x{{ getSlotItems(day, slot.id)[0].portions }}</span>
                         </div>
                    </div>
                </template>
                <template v-else>
                    <div class="absolute inset-0 flex flex-col items-center justify-center p-1" :class="getSlotItems(day, slot.id)[0].ignore_shopping ? 'bg-red-50' : 'bg-white'">
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

    <transition name="fade">
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
    </transition>

    <DishDetailModal :is-open="showDishModal" :dish="viewingDish" @close="showDishModal = false" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.pop-enter-active { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.pop-leave-active { animation: popOut 0.2s ease-in; }
@keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes popOut { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.5); opacity: 0; } }
</style>