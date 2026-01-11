<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isToday, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

// --- НАСТРОЙКИ ---
const auth = useAuthStore()
const activeTab = ref('day') // 1. При открытии всегда вкладка "День"
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
  // Грузим с запасом (текущая неделя + следующая)
  const start = format(currentWeekStart.value, 'yyyy-MM-dd')
  const end = format(addDays(currentWeekStart.value, 13), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      date,
      category,
      dish:dishes ( id, title, image_url, calories )
    `)
    // Убираем фильтр по household_id, раз мы открыли базу всем, 
    // но лучше оставить, если ты планируешь потом разделять семьи.
    // Пока оставим как есть:
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

const currentDayData = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  // Собираем только существующие блюда
  const meals = []
  categories.forEach(cat => {
    const dish = plan.value.find(p => p.date === dStr && p.category === cat.key)?.dish
    if (dish) {
      meals.push({ categoryLabel: cat.label, dish })
    }
  })
  return meals
})

// --- ДЕЙСТВИЯ ---
const goToToday = () => {
  const today = new Date()
  selectedDate.value = today
  // Если "Сегодня" в другой неделе, переключаем сетку
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

// Форматирование: "9 янв СБ"
const formatHeader = (date) => {
  const dayNum = format(date, 'd')
  const month = format(date, 'MMM', { locale: ru }).replace('.', '')
  const dayName = format(date, 'EEE', { locale: ru }).toUpperCase()
  return { dayNum, month, dayName }
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
    
    <div class="bg-white px-4 py-2 shadow-sm z-10 sticky top-0">
      <div class="flex items-center justify-between mb-2">
        <h1 class="text-xl font-bold text-slate-800">План питания</h1>
      </div>
      <div class="flex bg-slate-100 p-1 rounded-lg">
        <button 
          @click="activeTab = 'day'"
          class="flex-1 py-1.5 text-sm font-semibold rounded-md transition-all"
          :class="activeTab === 'day' ? 'bg-white shadow text-slate-900' : 'text-slate-500'"
        >
          День
        </button>
        <button 
          @click="activeTab = 'week'"
          class="flex-1 py-1.5 text-sm font-semibold rounded-md transition-all"
          :class="activeTab === 'week' ? 'bg-white shadow text-slate-900' : 'text-slate-500'"
        >
          Сетка
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'day'" class="flex-1 overflow-y-auto">
      
      <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-100 mb-4">
        <button @click="changeDay(-1)" class="p-2 text-slate-400">
          <span class="material-icons-round">chevron_left</span>
        </button>
        
        <div class="flex flex-col items-center">
          <span class="text-lg font-bold text-slate-800 capitalize leading-none">
            {{ formatSelectedDate(selectedDate) }}
          </span>
          <button 
            v-if="!isToday(selectedDate)"
            @click="goToToday"
            class="text-xs font-bold text-orange-500 mt-1 uppercase tracking-wide"
          >
            Вернуться в Сегодня
          </button>
          <span v-else class="text-xs font-medium text-slate-400 mt-1">Сегодня</span>
        </div>

        <button @click="changeDay(1)" class="p-2 text-slate-400">
          <span class="material-icons-round">chevron_right</span>
        </button>
      </div>

      <div class="px-4 space-y-3 pb-20">
        
        <div v-if="currentDayData.length === 0" class="text-center py-12">
          <div class="text-5xl mb-4">🍽️</div>
          <p class="text-slate-500 mb-4">День свободен</p>
          <button 
            @click="activeTab = 'week'" 
            class="bg-slate-800 text-white px-6 py-3 rounded-xl text-sm font-bold"
          >
            Заполнить в сетке
          </button>
        </div>

        <div 
          v-for="(item, idx) in currentDayData" 
          :key="idx"
          class="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex gap-4 items-center"
        >
          <div class="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
            <img 
              v-if="item.dish.image_url" 
              :src="item.dish.image_url" 
              class="w-full h-full object-cover"
            >
            <span v-else class="w-full h-full flex items-center justify-center text-xl">🥘</span>
          </div>

          <div class="flex-1">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              {{ item.categoryLabel }}
            </div>
            <div class="font-bold text-slate-800 leading-tight">
              {{ item.dish.title }}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              {{ item.dish.calories ? item.dish.calories + ' ккал' : '' }}
            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-100">
        <button @click="changeWeek(-7)" class="p-1"><span class="material-icons-round text-slate-400">chevron_left</span></button>
        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Неделя {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="p-1"><span class="material-icons-round text-slate-400">chevron_right</span></button>
      </div>

      <div class="divide-y divide-slate-200 pb-20 bg-white">
        <div v-for="day in weekDays" :key="day" class="flex min-h-[90px]">
          
          <div 
            class="w-14 flex-shrink-0 border-r border-slate-100 flex flex-col items-center justify-center p-1"
            :class="isToday(day) ? 'bg-orange-50' : 'bg-slate-50'"
          >
            <span class="text-lg font-black leading-none" :class="isToday(day) ? 'text-orange-600' : 'text-slate-700'">
              {{ formatHeader(day).dayNum }}
            </span>
            <span class="text-[10px] font-bold uppercase leading-tight mt-1" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">
              {{ formatHeader(day).month }}
            </span>
            <span class="text-[10px] font-bold uppercase leading-tight" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">
              {{ formatHeader(day).dayName }}
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
                <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shadow-sm mb-1">
                   <img v-if="getDish(day, cat.key).image_url" :src="getDish(day, cat.key).image_url" class="w-full h-full object-cover">
                </div>
                <span class="text-[9px] leading-tight text-center font-medium line-clamp-2 text-slate-800">
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