<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isToday, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

const auth = useAuthStore()

// 1. При открытии всегда активна вкладка "День"
const activeTab = ref('day') 

const currentWeekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))
const selectedDate = ref(new Date()) 
const plan = ref([])
const loading = ref(false)

const categories = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' }
]

// --- ЗАГРУЗКА ---
const fetchPlan = async () => {
  loading.value = true
  const start = format(currentWeekStart.value, 'yyyy-MM-dd')
  const end = format(addDays(currentWeekStart.value, 13), 'yyyy-MM-dd')

  // ВАЖНО: Убрали .eq('household_id'), чтобы Админ видел всё
  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      date,
      category,
      dish:dishes ( id, title, image_url, calories )
    `)
    .gte('date', start)
    .lte('date', end)

  if (error) console.error(error)
  else plan.value = data || []
  
  loading.value = false
}

// --- ВЫЧИСЛЕНИЯ ---
const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart.value, i))
})

const getDish = (date, catKey) => {
  const dStr = format(date, 'yyyy-MM-dd')
  return plan.value.find(p => p.date === dStr && p.category === catKey)?.dish
}

// Данные только для Вкладки "День" (фильтруем пустые)
const currentDayMeals = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  const list = []
  
  categories.forEach(cat => {
    const dish = plan.value.find(p => p.date === dStr && p.category === cat.key)?.dish
    if (dish) {
      // Добавляем только если блюдо есть
      list.push({ ...cat, dish })
    }
  })
  return list
})

// --- ДЕЙСТВИЯ ---
const goToToday = () => {
  const today = new Date()
  selectedDate.value = today
  // Если сегодня в другой неделе — переключаем сетку
  if (!isSameDay(startOfWeek(today, { weekStartsOn: 1 }), currentWeekStart.value)) {
    currentWeekStart.value = startOfWeek(today, { weekStartsOn: 1 })
    fetchPlan()
  }
}

const changeDay = (delta) => {
  selectedDate.value = addDays(selectedDate.value, delta)
}

const changeWeek = (delta) => {
  currentWeekStart.value = addDays(currentWeekStart.value, delta)
  fetchPlan()
}

// Форматирование для Сетки: { num: "9", month: "янв", day: "СБ" }
const formatGridHeader = (date) => {
  return {
    num: format(date, 'd'),
    month: format(date, 'MMM', { locale: ru }).replace('.', ''),
    day: format(date, 'EEE', { locale: ru }).toUpperCase()
  }
}

const formatDayTitle = (date) => {
  return format(date, 'd MMMM, EEEE', { locale: ru })
}

onMounted(() => {
  fetchPlan()
})
</script>

<template>
  <div class="flex flex-col h-full bg-slate-50">
    
    <div class="bg-white px-4 pt-4 pb-2 shadow-sm z-10 sticky top-0 rounded-b-3xl">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold text-slate-900">Мой План</h1>
      </div>
      
      <div class="flex bg-slate-100 p-1 rounded-2xl">
        <button 
          @click="activeTab = 'day'"
          class="flex-1 py-2 text-sm font-bold rounded-xl transition-all"
          :class="activeTab === 'day' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'"
        >
          День
        </button>
        <button 
          @click="activeTab = 'week'"
          class="flex-1 py-2 text-sm font-bold rounded-xl transition-all"
          :class="activeTab === 'week' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'"
        >
          Сетка
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'day'" class="flex-1 overflow-y-auto pb-20 pt-2">
      
      <div class="px-4 flex items-center justify-between mb-4">
        <button @click="changeDay(-1)" class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400">
          <span class="material-icons-round">chevron_left</span>
        </button>
        
        <div class="flex flex-col items-center">
          <span class="text-lg font-bold text-slate-800 capitalize leading-tight">
            {{ formatDayTitle(selectedDate) }}
          </span>
          <button 
            v-if="!isToday(selectedDate)" 
            @click="goToToday"
            class="text-xs font-bold text-orange-500 uppercase mt-1 bg-orange-50 px-2 py-0.5 rounded-md"
          >
            Сегодня
          </button>
          <span v-else class="text-xs font-bold text-slate-400 mt-1 uppercase">Сегодня</span>
        </div>

        <button @click="changeDay(1)" class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400">
          <span class="material-icons-round">chevron_right</span>
        </button>
      </div>

      <div class="px-4 space-y-3">
        
        <div v-if="currentDayMeals.length === 0" class="text-center py-10">
          <div class="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🍽️
          </div>
          <p class="text-slate-500 font-medium">План пуст</p>
          <button 
            @click="activeTab = 'week'"
            class="mt-4 text-orange-500 font-bold text-sm"
          >
            Перейти в сетку
          </button>
        </div>

        <div 
          v-for="item in currentDayMeals" 
          :key="item.key"
          class="bg-white p-3 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div class="w-16 h-16 bg-slate-100 rounded-2xl overflow-hidden flex-shrink-0">
            <img 
              v-if="item.dish.image_url" 
              :src="item.dish.image_url" 
              class="w-full h-full object-cover"
            >
            <span v-else class="w-full h-full flex items-center justify-center text-xl">🥘</span>
          </div>

          <div class="flex-1">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              {{ item.label }}
            </div>
            <div class="text-sm font-bold text-slate-800 leading-tight">
              {{ item.dish.title }}
            </div>
            <div class="text-xs text-slate-400 font-medium mt-1">
              {{ item.dish.calories }} ккал
            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto pb-20 bg-white">
      
      <div class="flex items-center justify-center py-2 border-b border-slate-50">
        <button @click="changeWeek(-7)" class="p-2 text-slate-300"><span class="material-icons-round">chevron_left</span></button>
        <span class="text-xs font-bold text-slate-400 uppercase tracking-widest px-4">
          Неделя {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="p-2 text-slate-300"><span class="material-icons-round">chevron_right</span></button>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="day in weekDays" :key="day" class="flex min-h-[90px]">
          
          <div 
            class="w-14 flex-shrink-0 flex flex-col items-center justify-center p-1 border-r border-slate-100"
            :class="isToday(day) ? 'bg-orange-50' : 'bg-white'"
          >
            <span class="text-lg font-black leading-none" :class="isToday(day) ? 'text-orange-600' : 'text-slate-800'">
              {{ formatGridHeader(day).num }}
            </span>
            <span class="text-[9px] font-bold uppercase leading-tight mt-1" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">
              {{ formatGridHeader(day).month }}
            </span>
             <span class="text-[9px] font-bold uppercase leading-tight" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">
              {{ formatGridHeader(day).day }}
            </span>
          </div>

          <div class="flex-1 grid grid-cols-4 divide-x divide-slate-100">
            <div 
              v-for="cat in categories" 
              :key="cat.key" 
              class="relative cursor-pointer hover:bg-slate-50 transition-colors"
              @click="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
            >
              <div v-if="getDish(day, cat.key)" class="absolute inset-0 p-1 flex flex-col items-center justify-center">
                <div class="w-9 h-9 rounded-full bg-slate-100 mb-1 overflow-hidden shadow-sm">
                  <img v-if="getDish(day, cat.key).image_url" :src="getDish(day, cat.key).image_url" class="w-full h-full object-cover">
                  <span v-else class="text-xs flex items-center justify-center h-full">🥘</span>
                </div>
                <span class="text-[8px] font-bold text-slate-800 text-center leading-none line-clamp-2">
                  {{ getDish(day, cat.key).title }}
                </span>
              </div>

              <div v-else class="absolute inset-0 flex items-center justify-center">
                <span class="text-[9px] font-bold text-slate-200 uppercase -rotate-90 md:rotate-0 select-none">
                  {{ cat.label }}
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>