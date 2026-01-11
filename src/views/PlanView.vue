<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isSameDay, isToday } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

// --- СОСТОЯНИЕ ---
const auth = useAuthStore()
// 1. Всегда открываем вкладку "День" при старте
const activeTab = ref('day') 
const currentWeekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))
const selectedDate = ref(new Date()) // Выбранный день для вкладки "День"
const plan = ref([])
const loading = ref(false)

// Категории еды (порядок важен)
const categories = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' }
]

// --- ЗАГРУЗКА ДАННЫХ ---
const fetchPlan = async () => {
  loading.value = true
  // Берем план на 2 недели (текущую и следующую) для запаса
  const start = format(currentWeekStart.value, 'yyyy-MM-dd')
  const end = format(addDays(currentWeekStart.value, 13), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      date,
      category,
      dish:dishes ( id, title, image_url, calories )
    `)
    .eq('household_id', auth.householdId)
    .gte('date', start)
    .lte('date', end)

  if (error) console.error('Ошибка загрузки плана:', error)
  else plan.value = data || []
  
  loading.value = false
}

// --- ВЫЧИСЛЕНИЯ ---

// Дни недели для Сетки (7 дней)
const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart.value, i))
})

// Получить блюдо для конкретной ячейки
const getDishForCell = (dateObj, categoryKey) => {
  const dateStr = format(dateObj, 'yyyy-MM-dd')
  return plan.value.find(p => p.date === dateStr && p.category === categoryKey)?.dish
}

// Данные для вкладки "День" (фильтруем план по выбранной дате)
const currentDayPlan = computed(() => {
  const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
  const dayMeals = {}
  let hasAnyMeal = false

  categories.forEach(cat => {
    const dish = plan.value.find(p => p.date === dateStr && p.category === cat.key)?.dish
    if (dish) {
      dayMeals[cat.key] = dish
      hasAnyMeal = true
    }
  })

  return { meals: dayMeals, isEmpty: !hasAnyMeal }
})

// --- ДЕЙСТВИЯ ---

// 2. Кнопка "Сегодня"
const goToToday = () => {
  selectedDate.value = new Date()
  // Если сегодня на другой неделе, переключаем сетку тоже
  currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
  fetchPlan()
}

const changeWeek = (days) => {
  currentWeekStart.value = addDays(currentWeekStart.value, days)
  fetchPlan()
}

const changeDay = (days) => {
  selectedDate.value = addDays(selectedDate.value, days)
}

// Форматирование даты для шапки (9 янв. СБ)
const formatDateHeader = (date) => {
  return new Intl.DateTimeFormat('ru-RU', { 
    day: 'numeric', 
    month: 'short', 
    weekday: 'short' 
  }).format(date)
}

// Форматирование текущего выбранного дня (для заголовка)
const formatSelectedDate = (date) => {
  return format(date, 'd MMMM, EEEE', { locale: ru })
}

onMounted(() => {
  if (auth.householdId) fetchPlan()
})
</script>

<template>
  <div class="flex flex-col h-full bg-slate-50">
    
    <header class="bg-white px-4 py-3 shadow-sm flex justify-between items-center sticky top-0 z-10">
      <h1 class="text-xl font-bold text-slate-800">План питания</h1>
      
      <div class="flex bg-slate-100 p-1 rounded-xl">
        <button 
          @click="activeTab = 'day'"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
          :class="activeTab === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'"
        >
          День
        </button>
        <button 
          @click="activeTab = 'week'"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
          :class="activeTab === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'"
        >
          Сетка
        </button>
      </div>
    </header>

    <div v-if="activeTab === 'day'" class="flex-1 overflow-y-auto pb-20">
      
      <div class="bg-white pb-4 px-4 flex items-center justify-between shadow-sm rounded-b-3xl mb-4">
        <button @click="changeDay(-1)" class="p-2 text-slate-400 hover:text-slate-600">
          <span class="material-icons-round">chevron_left</span>
        </button>
        
        <div class="text-center">
          <div class="text-lg font-bold text-slate-800 capitalize">
            {{ formatSelectedDate(selectedDate) }}
          </div>
          <button 
            v-if="!isToday(selectedDate)" 
            @click="goToToday"
            class="text-xs text-orange-500 font-bold uppercase tracking-wide mt-1"
          >
            Вернуться в Сегодня
          </button>
          <span v-else class="text-xs text-slate-400 font-medium">Сегодня</span>
        </div>

        <button @click="changeDay(1)" class="p-2 text-slate-400 hover:text-slate-600">
          <span class="material-icons-round">chevron_right</span>
        </button>
      </div>

      <div class="px-4 space-y-4">
        
        <div v-if="currentDayPlan.isEmpty" class="text-center py-10">
           <span class="text-4xl block mb-2">🍽️</span>
           <p class="text-slate-400 text-sm">На этот день ничего не запланировано</p>
           <button @click="activeTab = 'week'" class="mt-4 text-orange-500 font-bold text-sm">
             Перейти в сетку для планирования
           </button>
        </div>

        <div v-for="cat in categories" :key="cat.key">
          <div v-if="currentDayPlan.meals[cat.key]" class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4">
            
            <div class="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
              <img 
                v-if="currentDayPlan.meals[cat.key].image_url" 
                :src="currentDayPlan.meals[cat.key].image_url" 
                class="w-full h-full object-cover"
              >
              <span v-else class="w-full h-full flex items-center justify-center text-xl">🥘</span>
            </div>

            <div class="flex-1 flex flex-col justify-center">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                {{ cat.label }}
              </span>
              <h3 class="font-bold text-slate-800 leading-tight mb-1">
                {{ currentDayPlan.meals[cat.key].title }}
              </h3>
              <div class="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded inline-block self-start">
                {{ currentDayPlan.meals[cat.key].calories }} ккал
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto pb-20">
      
      <div class="flex justify-between items-center px-4 py-2 bg-white border-b border-slate-100">
        <button @click="changeWeek(-7)" class="p-2 text-slate-400"><span class="material-icons-round">chevron_left</span></button>
        <span class="text-sm font-bold text-slate-700">Неделя {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}</span>
        <button @click="changeWeek(7)" class="p-2 text-slate-400"><span class="material-icons-round">chevron_right</span></button>
      </div>

      <div class="divide-y divide-slate-200">
        <div v-for="day in weekDays" :key="day" class="flex min-h-[100px] bg-white">
          
          <div 
            class="w-16 flex-shrink-0 border-r border-slate-100 flex flex-col items-center justify-center p-1"
            :class="isToday(day) ? 'bg-orange-50 border-r-2 border-r-orange-400' : 'bg-slate-50'"
          >
            <span 
              class="text-xs font-bold text-center leading-tight uppercase"
              :class="isToday(day) ? 'text-orange-600' : 'text-slate-500'"
            >
              {{ formatDateHeader(day) }}
            </span>
          </div>

          <div class="flex-1 grid grid-cols-4 divide-x divide-slate-100">
            <div 
              v-for="cat in categories" 
              :key="cat.key" 
              class="relative p-1 h-full flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 active:scale-95 transition-transform"
              @click="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
            >
              <div v-if="getDishForCell(day, cat.key)" class="w-full h-full flex flex-col items-center justify-center">
                <div class="w-8 h-8 rounded-full bg-slate-100 mb-1 overflow-hidden shadow-sm">
                  <img 
                     v-if="getDishForCell(day, cat.key).image_url" 
                     :src="getDishForCell(day, cat.key).image_url" 
                     class="w-full h-full object-cover"
                  >
                  <span v-else class="text-xs flex items-center justify-center h-full">🥘</span>
                </div>
                <span class="text-[9px] leading-tight text-slate-900 font-medium line-clamp-2 px-1">
                  {{ getDishForCell(day, cat.key).title }}
                </span>
              </div>

              <div v-else class="flex items-center justify-center h-full w-full">
                <span class="text-[10px] text-slate-200 font-bold uppercase -rotate-90 md:rotate-0 whitespace-nowrap">
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