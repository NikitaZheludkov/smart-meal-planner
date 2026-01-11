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

  // Чтобы Админ видел все блюда, мы не фильтруем по household_id
  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      date,
      category,
      dish:dishes ( id, title, image_url, calories )
    `)
    .gte('date', start)
    .lte('date', end)

  if (error) console.error('Ошибка загрузки:', error)
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
  <div class="flex flex-col h-full bg-slate-50">
    
    <header class="flex items-center justify-between px-6 py-5 bg-white sticky top-0 z-10 rounded-b-[32px] shadow-sm">
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">План</h1>
      
      <div class="flex items-center bg-slate-100 rounded-full p-1.5 shadow-inner">
        <button @click="changeWeek(-7)" class="w-10 h-10 flex items-center justify-center rounded-full bg-white text-slate-400 shadow-sm hover:text-slate-600 transition-all active:scale-95">
          <span class="material-icons-round">chevron_left</span>
        </button>
        <span class="text-sm font-bold text-slate-700 px-4 min-w-[100px] text-center capitalize leading-none">
          {{ format(currentWeekStart, 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="w-10 h-10 flex items-center justify-center rounded-full bg-white text-slate-400 shadow-sm hover:text-slate-600 transition-all active:scale-95">
          <span class="material-icons-round">chevron_right</span>
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      
      <div v-for="day in weekDays" :key="day" class="bg-white rounded-[32px] p-5 shadow-sm shadow-slate-100/50 relative overflow-hidden">
        
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-black" :class="isToday(day) ? 'text-orange-500' : 'text-slate-900'">
              {{ format(day, 'd') }}
            </span>
            <span class="text-sm font-bold uppercase tracking-wider" :class="isToday(day) ? 'text-orange-400' : 'text-slate-400'">
              {{ format(day, 'EEEE', { locale: ru }) }}
            </span>
          </div>
          <div v-if="isToday(day)" class="bg-orange-50 text-orange-500 text-[10px] font-bold uppercase px-2 py-1 rounded-full tracking-widest">
            Сегодня
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2">
          <div 
            v-for="cat in categories" 
            :key="cat.key"
            class="flex flex-col items-center"
            @click="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
          >
            <span class="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
              {{ cat.label }}
            </span>
            
            <div class="w-full aspect-square rounded-2xl bg-slate-50 flex items-center justify-center relative overflow-hidden group transition-all hover:bg-slate-100 active:scale-95 cursor-pointer shadow-sm border border-slate-100">
              
              <div v-if="getDish(day, cat.key)" class="w-full h-full flex flex-col items-center p-1">
                <img 
                  v-if="getDish(day, cat.key).image_url" 
                  :src="getDish(day, cat.key).image_url" 
                  class="w-full h-full object-cover rounded-xl"
                >
                <span v-else class="text-2xl">🥘</span>
                <div class="absolute inset-0 bg-black/50 flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <span class="text-white text-[9px] font-bold leading-tight line-clamp-2 text-center w-full">
                     {{ getDish(day, cat.key).title }}
                   </span>
                </div>
              </div>
              
              <span v-else class="material-icons-round text-slate-300 text-2xl group-hover:text-slate-400 transition-colors">
                add_circle_outline
              </span>

            </div>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>