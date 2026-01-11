<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isSameDay, isToday } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

// --- СОСТОЯНИЕ ---
const auth = useAuthStore()
const activeTab = ref('day') // 1. Стартуем с вкладки ДЕНЬ
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

// --- ЗАГРУЗКА ДАННЫХ ---
const fetchPlan = async () => {
  loading.value = true
  const start = format(currentWeekStart.value, 'yyyy-MM-dd')
  const end = format(addDays(currentWeekStart.value, 13), 'yyyy-MM-dd')

  // Убрали фильтр по семье, чтобы Админ видел всё
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

// --- ЛОГИКА ---
const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart.value, i))
})

// Получить блюдо для ячейки
const getDish = (date, catKey) => {
  const dStr = format(date, 'yyyy-MM-dd')
  return plan.value.find(p => p.date === dStr && p.category === catKey)?.dish
}

// Данные для карточки Дня
const currentDayMeals = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  const meals = []
  categories.forEach(cat => {
    const dish = plan.value.find(p => p.date === dStr && p.category === cat.key)?.dish
    if (dish) {
      meals.push({ label: cat.label, dish })
    }
  })
  return meals
})

// --- ДЕЙСТВИЯ ---
const goToToday = () => {
  const today = new Date()
  selectedDate.value = today
  // Если сегодня на другой неделе — переключаем сетку
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

// Форматирование даты для заголовка (9 янв, ПТ)
const formatDateHeader = (date) => {
  return {
    day: format(date, 'd'),
    month: format(date, 'MMM', { locale: ru }).replace('.', ''),
    week: format(date, 'EEE', { locale: ru }).toUpperCase()
  }
}

const formatSelectedDate = (date) => {
  return format(date, 'd MMMM, EEEE', { locale: ru })
}

onMounted(() => {
  fetchPlan()
})
</script>

<template>
  <div class="flex flex-col h-full bg-slate-50">
    
    <div class="bg-white px-4 py-3 shadow-sm z-20 sticky top-0">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">План питания</h1>
      </div>
      
      <div class="flex bg-slate-100 p-1 rounded-xl">
        <button 
          @click="activeTab = 'day'"
          class="flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200"
          :class="activeTab === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
        >
          День
        </button>
        <button 
          @click="activeTab = 'week'"
          class="flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200"
          :class="activeTab === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
        >
          Сетка
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'day'" class="flex-1 overflow-y-auto pb-24">
      
      <div class="bg-white px-4 py-2 pb-4 rounded-b-3xl shadow-sm mb-4 flex items-center justify-between">
        <button @click="changeDay(-1)" class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
          <span class="material-icons-round">chevron_left</span>
        </button>
        
        <div class="text-center">
          <div class="text-lg font-bold text-slate-800 capitalize leading-tight">
            {{ formatSelectedDate(selectedDate) }}
          </div>
          <button 
            v-if="!isToday(selectedDate)" 
            @click="goToToday"
            class="text-xs font-bold text-orange-500 uppercase tracking-wide mt-1"
          >
            Вернуться в Сегодня
          </button>
          <span v-else class="text-xs font-medium text-slate-400 mt-1 block">Сегодня</span>
        </div>

        <button @click="changeDay(1)" class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
          <span class="material-icons-round">chevron_right</span>
        </button>
      </div>

      <div class="px-4 space-y-3">
        
        <div v-if="currentDayMeals.length === 0" class="text-center py-10 opacity-60">
          <div class="text-6xl mb-4">🥗</div>
          <p class="text-slate-500 font-medium">В этот день пока пусто</p>
          <button @click="activeTab = 'week'" class="text-orange-500 font-bold text-sm mt-2">
            Перейти в сетку
          </button>
        </div>

        <div 
          v-for="(item, idx) in currentDayMeals" 
          :key="idx"
          class="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div class="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 relative">
            <img v-if="item.dish.image_url" :src="item.dish.image_url" class="w-full h-full object-cover">
            <span v-else class="absolute inset-0 flex items-center justify-center text-2xl">🥘</span>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {{ item.label }}
            </div>
            <h3 class="text-base font-bold text-slate-800 leading-tight truncate pr-2">
              {{ item.dish.title }}
            </h3>
            <div class="mt-2 inline-flex items-center px-2 py-0.5 rounded bg-slate-50 border border-slate-100">
              <span class="text-[10px] font-bold text-slate-500">
                {{ item.dish.calories ? item.dish.calories + ' ккал' : '---' }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto pb-24 bg-white">
      
      <div class="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <button @click="changeWeek(-7)" class="p-2 text-slate-400"><span class="material-icons-round">chevron_left</span></button>
        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Неделя {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="p-2 text-slate-400"><span class="material-icons-round">chevron_right</span></button>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="day in weekDays" :key="day" class="flex min-h-[96px]">
          
          <div 
            class="w-14 flex-shrink-0 border-r border-slate-100 flex flex-col items-center justify-center p-1"
            :class="isToday(day) ? 'bg-orange-50' : 'bg-slate-50'"
          >
            <span class="text-lg font-black leading-none" :class="isToday(day) ? 'text-orange-500' : 'text-slate-800'">
              {{ formatDateHeader(day).day }}
            </span>
            <span class="text-[9px] font-bold uppercase mt-1 leading-none" :class="isToday(day) ? 'text-orange-400' : 'text-slate-400'">
              {{ formatDateHeader(day).month }}
            </span>
            <span class="text-[9px] font-bold uppercase leading-none" :class="isToday(day) ? 'text-orange-400' : 'text-slate-400'">
              {{ formatDateHeader(day).week }}
            </span>
          </div>

          <div class="flex-1 grid grid-cols-4 divide-x divide-slate-100">
            <div 
              v-for="cat in categories" 
              :key="cat.key"
              class="relative cursor-pointer hover:bg-slate-50 transition-colors active:bg-slate-100"
              @click="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
            >
              
              <div v-if="getDish(day, cat.key)" class="absolute inset-0 p-1 flex flex-col items-center justify-center">
                <div class="w-9 h-9 rounded-full bg-slate-100 mb-1 overflow-hidden shadow-sm ring-2 ring-white">
                   <img v-if="getDish(day, cat.key).image_url" :src="getDish(day, cat.key).image_url" class="w-full h-full object-cover">
                </div>
                <span class="text-[8px] font-bold leading-tight text-center text-slate-700 line-clamp-2 w-full px-0.5">
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