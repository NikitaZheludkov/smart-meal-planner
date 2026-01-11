<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import { useDishStore } from '../stores/dishes'
import { useSettingsStore } from '../stores/settings'

const planStore = usePlanStore()
const dishStore = useDishStore()
const settings = useSettingsStore()

const activeTab = ref('Сетка')
const orderedSlots = ['Завтрак', 'Обед', 'Гарнир', 'Салат', 'Перекус']

// ЦВЕТОВАЯ СХЕМА
const slotColors = {
  'Завтрак': 'bg-orange-400',
  'Обед': 'bg-teal-400',
  'Гарнир': 'bg-amber-400',
  'Салат': 'bg-lime-500',
  'Перекус': 'bg-indigo-400'
}

// ЛОГИКА ДАТ
const periodStart = ref(new Date()) 
const alignToStartDay = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const target = settings.startDay
  const diff = (day < target ? 7 : 0) + day - target
  d.setDate(d.getDate() - diff)
  return d
}
watch(() => settings.startDay, () => { periodStart.value = alignToStartDay(new Date()) })

const changePeriod = (direction) => {
  const daysToAdd = settings.periodLength * direction
  const newDate = new Date(periodStart.value)
  newDate.setDate(newDate.getDate() + daysToAdd)
  periodStart.value = newDate
}

const periodDays = computed(() => {
  const days = []
  const start = new Date(periodStart.value)
  for (let i = 0; i < settings.periodLength; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push({
      fullDate: d.toISOString().split('T')[0],
      dayNum: d.getDate().toString().padStart(2, '0'),
      monthNum: (d.getMonth() + 1).toString().padStart(2, '0'),
      dayName: d.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase(),
      isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
    })
  }
  return days
})

const periodLabel = computed(() => {
  if (periodDays.value.length === 0) return ''
  const first = periodDays.value[0]
  const last = periodDays.value[periodDays.value.length - 1]
  return `${first.dayNum}.${first.monthNum} - ${last.dayNum}.${last.monthNum}`
})

// ДЕНЬ
const currentDayDate = ref(new Date().toISOString().split('T')[0])
const changeDay = (days) => {
  const d = new Date(currentDayDate.value)
  d.setDate(d.getDate() + days)
  currentDayDate.value = d.toISOString().split('T')[0]
}
const formattedCurrentDay = computed(() => {
  const d = new Date(currentDayDate.value)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
})

const getDishFor = (date, slot) => planStore.plan.find(p => p.date === date && p.slot === slot)

// МОДАЛКИ
const showSelectModal = ref(false)
const targetDate = ref('')
const targetSlot = ref('')
const dishSearch = ref('')

const openSlot = (date, slot) => {
  targetDate.value = date
  targetSlot.value = slot
  dishSearch.value = ''
  showSelectModal.value = true
  if (dishStore.dishes.length === 0) dishStore.fetchDishes()
}

const filteredDishes = computed(() => {
  let res = dishStore.dishes
  if (dishSearch.value) res = res.filter(d => d.name.toLowerCase().includes(dishSearch.value.toLowerCase()))
  return [...res].sort((a, b) => (b.category === targetSlot.value) - (a.category === targetSlot.value))
})

const selectDish = async (dish) => {
  const existing = getDishFor(targetDate.value, targetSlot.value)
  if (existing) await planStore.removeFromPlan(existing.id)
  await planStore.addToPlan(targetDate.value, targetSlot.value, dish.id)
  showSelectModal.value = false
}

const clearSlot = async () => {
  const existing = getDishFor(targetDate.value, targetSlot.value)
  if (existing) await planStore.removeFromPlan(existing.id)
  showSelectModal.value = false
}

const showRecipeModal = ref(false)
const viewingDish = ref(null)
const openRecipe = async (planEntry) => {
  if (!planEntry) return
  let dish = dishStore.dishes.find(d => d.id === planEntry.dish_id)
  if (!dish) {
      await dishStore.fetchDishes()
      dish = dishStore.dishes.find(d => d.id === planEntry.dish_id)
  }
  viewingDish.value = dish
  showRecipeModal.value = true
}

onMounted(async () => {
  await settings.fetchSettings()
  periodStart.value = alignToStartDay(new Date())
  if (planStore.plan.length === 0) planStore.fetchPlan()
  if (dishStore.dishes.length === 0) dishStore.fetchDishes()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    
    <div class="bg-slate-50 pt-12 pb-2 px-5 sticky top-0 z-20">
      <div class="flex justify-between items-end mb-4">
        <h1 class="text-3xl font-bold text-slate-900 tracking-tight">План</h1>
      </div>

      <div class="bg-slate-200/80 p-1 rounded-xl flex font-bold text-[13px] relative mb-4">
        <button 
          @click="activeTab = 'День'" 
          class="flex-1 py-1.5 rounded-lg transition-all relative z-10"
          :class="activeTab === 'День' ? 'text-slate-900' : 'text-slate-500'"
        >
          День
        </button>
        <button 
          @click="activeTab = 'Сетка'" 
          class="flex-1 py-1.5 rounded-lg transition-all relative z-10"
          :class="activeTab === 'Сетка' ? 'text-slate-900' : 'text-slate-500'"
        >
          Сетка
        </button>
        <div 
          class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out"
          :class="activeTab === 'День' ? 'left-1' : 'left-[calc(50%+2px)]'"
        ></div>
      </div>

      <div v-if="activeTab === 'Сетка'" class="flex items-center justify-between mb-2 px-1">
        <button @click="changePeriod(-1)" class="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 shadow-sm tap-effect"><span class="material-icons-round text-sm">chevron_left</span></button>
        <div class="text-center">
          <div class="font-bold text-slate-900 text-lg leading-none">{{ periodLabel }}</div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Период</div>
        </div>
        <button @click="changePeriod(1)" class="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 shadow-sm tap-effect"><span class="material-icons-round text-sm">chevron_right</span></button>
      </div>

      <div v-else class="flex items-center justify-between mb-2 px-1">
        <button @click="changeDay(-1)" class="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 shadow-sm tap-effect"><span class="material-icons-round text-sm">chevron_left</span></button>
        <div class="text-center">
          <div class="font-bold text-slate-900 text-lg capitalize leading-none">{{ formattedCurrentDay }}</div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Обзор дня</div>
        </div>
        <button @click="changeDay(1)" class="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 shadow-sm tap-effect"><span class="material-icons-round text-sm">chevron_right</span></button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-32">
      
      <div v-if="activeTab === 'Сетка'" class="space-y-4 pt-2">
        <div v-for="day in periodDays" :key="day.fullDate" 
             class="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100/50">
          
          <div class="flex items-center gap-3 mb-3 border-b border-slate-50 pb-2">
            <span class="font-bold text-xl text-slate-900">{{ day.dayNum }}</span>
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">{{ day.dayName }}</span>
            <span v-if="day.isToday" class="ml-auto text-[10px] font-bold bg-slate-900 text-white px-2 py-1 rounded-full">СЕГОДНЯ</span>
          </div>

          <div class="grid grid-cols-5 gap-2">
            <div v-for="slot in orderedSlots" :key="slot"
                 @click="openSlot(day.fullDate, slot)"
                 class="aspect-square rounded-2xl flex flex-col items-center justify-center text-center p-1 tap-effect relative transition-all"
                 :class="getDishFor(day.fullDate, slot) ? 'bg-slate-50 ring-1 ring-slate-200' : 'bg-slate-50 border-2 border-dashed border-slate-100'">
              <div v-if="!getDishFor(day.fullDate, slot)" class="flex flex-col items-center opacity-30">
                <span class="material-icons-round text-lg">add</span>
              </div>
              <div v-else class="w-full h-full flex flex-col justify-center items-center">
                <span class="text-[9px] font-bold text-slate-800 leading-tight line-clamp-3">{{ getDishFor(day.fullDate, slot).dishes.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-4 pt-2">
        
        <div class="bg-white rounded-2xl p-3 flex justify-between items-center shadow-sm border border-slate-100">
          <div class="flex items-center gap-2">
             <span class="text-lg">🔥</span>
             <span class="font-bold text-slate-900">0</span>
          </div>
          <div class="flex gap-4 text-xs font-bold text-slate-400">
             <span>Б <span class="text-slate-800">0</span></span>
             <span>Ж <span class="text-slate-800">0</span></span>
             <span>У <span class="text-slate-800">0</span></span>
          </div>
        </div>

        <div v-for="slot in orderedSlots" :key="slot">
          <div class="bg-white rounded-2xl shadow-sm flex overflow-hidden border border-slate-100 min-h-[90px] tap-effect"
               @click="openRecipe(getDishFor(currentDayDate, slot))">
            
            <div class="w-1.5 shrink-0" :class="slotColors[slot] || 'bg-slate-200'"></div>

            <div class="p-4 flex-1 flex flex-col justify-center">
              <div class="flex justify-between items-start mb-1">
                 <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{{ slot }}</span>
                 <span class="text-[10px] font-bold text-slate-300">0 ккал</span>
              </div>

              <div v-if="getDishFor(currentDayDate, slot)">
                <div class="font-bold text-slate-900 text-lg leading-tight mb-2">
                  {{ getDishFor(currentDayDate, slot).dishes.name }}
                </div>
              </div>
              
              <div v-else class="flex items-center gap-2 mt-1 opacity-50">
                 <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                    <span class="material-icons-round text-lg">add</span>
                 </div>
                 <span class="text-sm font-bold text-slate-300">Добавить</span>
              </div>
            </div>

            <div class="pr-4 flex items-center justify-center text-slate-300">
               <span class="material-icons-round">chevron_right</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <transition name="modal">
      <div v-if="showSelectModal" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="showSelectModal = false">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
        <div class="bg-white w-full max-w-sm h-[75vh] rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative z-10 flex flex-col mb-safe animate-slide-up">
          <div class="modal-handle"></div>
          <h3 class="text-2xl font-bold text-slate-900 mb-1">Выбор блюда</h3>
          <p class="text-sm text-slate-400 font-bold mb-5">{{ targetSlot }}</p>
          <div class="relative mb-4">
            <span class="material-icons-round absolute left-4 top-3.5 text-slate-400">search</span>
            <input v-model="dishSearch" type="text" placeholder="Поиск..." class="w-full pl-11 p-3.5 bg-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 ring-slate-900/10">
          </div>
          <div class="flex-1 overflow-y-auto space-y-2 no-scrollbar">
             <button @click="clearSlot" class="w-full py-3 text-red-500 rounded-xl font-bold text-sm mb-2 border border-red-100 bg-red-50 tap-effect">Очистить слот</button>
            <div v-for="dish in filteredDishes" :key="dish.id" @click="selectDish(dish)" class="p-4 rounded-2xl flex justify-between items-center tap-effect transition-colors" :class="dish.category === targetSlot ? 'bg-amber-50 border border-amber-100' : 'bg-white border border-slate-100'">
              <span class="font-bold text-slate-700">{{ dish.name }}</span>
              <span class="text-[10px] font-bold px-2 py-1 rounded-lg uppercase" :class="dish.category === targetSlot ? 'text-amber-700 bg-amber-100/50' : 'text-slate-400 bg-slate-100'">{{ dish.category }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="modal">
      <div v-if="showRecipeModal" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="showRecipeModal = false">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
        <div class="bg-white w-full max-w-sm h-[90vh] sm:h-auto rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative z-10 flex flex-col mb-safe animate-slide-up no-scrollbar overflow-hidden">
          
          <div class="flex justify-end mb-4 shrink-0">
             <button @click="showRecipeModal = false" class="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center tap-effect hover:bg-slate-100">
               <span class="material-icons-round">keyboard_arrow_down</span>
             </button>
          </div>

          <div class="overflow-y-auto no-scrollbar pb-10">
              <div class="text-[10px] font-bold tracking-widest bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full inline-block mb-3 uppercase border border-emerald-100">{{ viewingDish?.category }}</div>
              <h3 class="text-3xl font-bold text-slate-900 leading-tight mb-6">{{ viewingDish?.name }}</h3>
              
              <div class="grid grid-cols-4 gap-2 mb-6">
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.kcal || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">ккал</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.protein || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">белки</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.fat || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">жиры</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.carbs || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">угле</div>
                </div>
              </div>

              <div v-if="viewingDish?.description" class="mb-6">
                 <h4 class="text-xs font-bold text-slate-900 uppercase mb-2 ml-1">Описание</h4>
                 <div class="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 leading-relaxed font-medium border border-slate-100">
                   {{ viewingDish.description }}
                 </div>
              </div>

              <div>
                <h4 class="text-xs font-bold text-slate-900 uppercase mb-3 ml-1 flex justify-between">
                  Ингредиенты <span class="text-slate-400">{{ viewingDish?.ingredients?.length || 0 }}</span>
                </h4>
                <div class="space-y-2">
                   <div v-if="!viewingDish?.ingredients?.length" class="text-slate-400 text-sm py-4 italic">Список пуст</div>
                   <div v-for="ing in viewingDish?.ingredients" :key="ing.id" class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                      <span class="font-bold text-slate-700">{{ ing.products?.name }}</span>
                      <span class="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg text-xs">{{ ing.amount }} {{ ing.products?.unit }}</span>
                   </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.3s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>