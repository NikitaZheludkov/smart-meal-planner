<script setup>
import { ref, computed, onMounted } from 'vue'
import { startOfWeek, addDays, format, isToday, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../lib/supabase'

const auth = useAuthStore()
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

const fetchPlan = async () => {
  loading.value = true
  const start = format(currentWeekStart.value, 'yyyy-MM-dd')
  const end = format(addDays(currentWeekStart.value, 13), 'yyyy-MM-dd')
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

const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart.value, i))
})

const getDish = (date, catKey) => {
  const dStr = format(date, 'yyyy-MM-dd')
  return plan.value.find(p => p.date === dStr && p.category === catKey)?.dish
}

const currentDayMeals = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  const list = []
  categories.forEach(cat => {
    const dish = plan.value.find(p => p.date === dStr && p.category === cat.key)?.dish
    if (dish) list.push({ ...cat, dish })
  })
  return list
})

const goToToday = () => {
  const today = new Date()
  selectedDate.value = today
  if (!isSameDay(startOfWeek(today, { weekStartsOn: 1 }), currentWeekStart.value)) {
    currentWeekStart.value = startOfWeek(today, { weekStartsOn: 1 })
    fetchPlan()
  }
}

const changeDay = (delta) => { selectedDate.value = addDays(selectedDate.value, delta) }
const changeWeek = (delta) => { currentWeekStart.value = addDays(currentWeekStart.value, delta); fetchPlan() }

onMounted(() => { fetchPlan() })
</script>

<template>
  <div class="flex flex-col h-full bg-slate-50">
    <div class="bg-white px-5 pt-6 pb-4 rounded-b-[32px] shadow-sm z-10 sticky top-0">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">Мой План</h1>
      </div>
      <div class="flex bg-slate-100 p-1.5 rounded-2xl">
        <button @click="activeTab = 'day'" class="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all" :class="activeTab === 'day' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'">День</button>
        <button @click="activeTab = 'week'" class="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all" :class="activeTab === 'week' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'">Сетка</button>
      </div>
    </div>

    <div v-if="activeTab === 'day'" class="flex-1 overflow-y-auto pb-20 pt-4 px-4">
      <div class="flex items-center justify-between mb-6 bg-white p-2 rounded-2xl shadow-sm">
        <button @click="changeDay(-1)" class="w-10 h-10 flex items-center justify-center text-slate-400"><span class="material-icons-round">chevron_left</span></button>
        <div class="flex flex-col items-center">
          <span class="text-sm font-bold text-slate-800 capitalize">{{ format(selectedDate, 'd MMMM, EEEE', { locale: ru }) }}</span>
          <button v-if="!isToday(selectedDate)" @click="goToToday" class="text-[10px] font-bold text-orange-500 uppercase mt-0.5">Сегодня</button>
        </div>
        <button @click="changeDay(1)" class="w-10 h-10 flex items-center justify-center text-slate-400"><span class="material-icons-round">chevron_right</span></button>
      </div>

      <div class="space-y-3">
        <div v-for="item in currentDayMeals" :key="item.key" class="bg-white p-3 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4">
          <div class="w-20 h-20 bg-slate-100 rounded-[20px] overflow-hidden flex-shrink-0 shadow-inner">
            <img v-if="item.dish.image_url" :src="item.dish.image_url" class="w-full h-full object-cover">
            <span v-else class="w-full h-full flex items-center justify-center text-2xl">🥘</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">{{ item.label }}</div>
            <div class="text-base font-bold text-slate-800 truncate mb-1">{{ item.dish.title }}</div>
            <div class="inline-block bg-slate-50 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500">{{ item.dish.calories }} ккал</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto pb-20 pt-4 px-4 space-y-3">
      <div class="flex items-center justify-between mb-2 px-2">
        <button @click="changeWeek(-7)" class="text-slate-400"><span class="material-icons-round">chevron_left</span></button>
        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">
          {{ format(currentWeekStart, 'd MMM', { locale: ru }) }} — {{ format(addDays(currentWeekStart, 6), 'd MMM', { locale: ru }) }}
        </span>
        <button @click="changeWeek(7)" class="text-slate-400"><span class="material-icons-round">chevron_right</span></button>
      </div>

      <div v-for="day in weekDays" :key="day" class="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100 flex items-center gap-4">
        <div class="flex flex-col items-center justify-center w-12 flex-shrink-0 border-r border-slate-100 pr-4">
          <span class="text-xl font-black text-slate-800">{{ format(day, 'd') }}</span>
          <span class="text-[10px] font-bold uppercase" :class="isToday(day) ? 'text-orange-500' : 'text-slate-400'">{{ format(day, 'EEE', { locale: ru }) }}</span>
        </div>

        <div class="flex-1 grid grid-cols-4 gap-2">
          <div 
            v-for="cat in categories" 
            :key="cat.key"
            @click.stop="$router.push(`/search?date=${format(day, 'yyyy-MM-dd')}&category=${cat.key}`)"
            class="aspect-square rounded-2xl flex items-center justify-center cursor-pointer transition-all active:scale-90 border overflow-hidden"
            :class="getDish(day, cat.key) ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-50 border-slate-50 hover:bg-slate-100'"
          >
            <img v-if="getDish(day, cat.key)?.image_url" :src="getDish(day, cat.key).image_url" class="w-full h-full object-cover">
            <span v-else-if="getDish(day, cat.key)" class="text-xs">🥘</span>
            <span v-else class="text-[8px] font-bold text-slate-300 uppercase">{{ cat.label.substring(0, 3) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>