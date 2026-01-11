<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isToday } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

const auth = useAuthStore()
const currentWeekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))
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
  const end = format(addDays(currentWeekStart.value, 6), 'yyyy-MM-dd')

  // ВАЖНО: Мы убрали фильтр .eq('household_id'), чтобы Админ видел всё
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

// --- ДАННЫЕ ДЛЯ СЕТКИ ---
const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart.value, i))
})

const getDish = (date, catKey) => {
  const dStr = format(date, 'yyyy-MM-dd')
  return plan.value.find(p => p.date === dStr && p.category === catKey)?.dish
}

// --- НАВИГАЦИЯ ---
const changeWeek = (days) => {
  currentWeekStart.value = addDays(currentWeekStart.value, days)
  fetchPlan()
}

onMounted(() => {
  fetchPlan()
})
</script>

<template>
  <div class="flex flex-col h-full bg-white">
    
    <header class="flex items-center justify-between px-4 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">План питания</h1>
      
      <div class="flex items-center bg-slate-100 rounded-full p-1">
        <button @click="changeWeek(-7)" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white shadow-sm transition-all">
          <span class="material-icons-round text-slate-500 text-sm">chevron_left</span>
        </button>
        <span class="text-xs font-bold text-slate-600 px-3 min-w-[80px] text-center">
          {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white shadow-sm transition-all">
          <span class="material-icons-round text-slate-500 text-sm">chevron_right</span>
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="divide-y divide-slate-100">
        
        <div v-for="day in weekDays" :key="day" class="flex min-h-[110px]">
          
          <div class="w-14 flex-shrink-0 border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center py-2 space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {{ format(day, 'EEE', { locale: ru }) }}
            </span>
            <div 
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              :class="isToday(day) ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-700'"
            >
              {{ format(day, 'd') }}
            </div>
          </div>

          <div class="flex-1 grid grid-cols-4 divide-x divide-slate-100">
            <div 
              v-for="cat in categories" 
              :key="cat.key" 
              class="relative p-1 hover:bg-slate-50 transition-colors cursor-pointer group"
              @click="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
            >
              <div class="absolute top-1 left-0 right-0 text-center z-10">
                <span class="text-[8px] font-bold text-slate-300 uppercase group-hover:text-slate-400 transition-colors">
                  {{ cat.label }}
                </span>
              </div>

              <div v-if="getDish(day, cat.key)" class="h-full w-full flex flex-col items-center justify-center pt-3">
                <div class="w-10 h-10 rounded-full bg-slate-100 mb-1 overflow-hidden shadow-sm border-2 border-white">
                  <img 
                    v-if="getDish(day, cat.key).image_url" 
                    :src="getDish(day, cat.key).image_url" 
                    class="w-full h-full object-cover"
                  >
                  <span v-else class="text-lg flex items-center justify-center h-full w-full">🥘</span>
                </div>
                <span class="text-[9px] font-bold text-slate-800 text-center leading-tight line-clamp-2 px-1">
                  {{ getDish(day, cat.key).title }}
                </span>
              </div>

              <div v-else class="h-full flex items-center justify-center pt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="material-icons-round text-slate-300 text-lg">add_circle</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>