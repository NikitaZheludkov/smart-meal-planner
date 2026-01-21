<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import { useSettingsStore } from '../stores/settings'
import { startOfWeek, addDays, format, isWithinInterval, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

const planStore = usePlanStore()
const settingsStore = useSettingsStore()

const activeTab = ref('list') // list | departments

// --- 1. УПРАВЛЕНИЕ ПЕРИОДОМ ---
const currentWeekStart = ref(new Date())
const periodLength = computed(() => settingsStore.periodLength || 7)

const periodLabel = computed(() => {
    const start = currentWeekStart.value
    const end = addDays(start, periodLength.value - 1)
    return `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`
})

const changePeriod = (dir) => {
    currentWeekStart.value = addDays(currentWeekStart.value, dir * periodLength.value)
}

// --- 2. ЛОГИКА ГАЛОЧЕК (CHECKBOXES) ---
const checkedIds = ref(new Set())

onMounted(() => {
    const saved = localStorage.getItem('shopping_checked_v1')
    if (saved) {
        try {
            checkedIds.value = new Set(JSON.parse(saved))
        } catch (e) { console.error(e) }
    }
    
    const day = settingsStore.startDay !== null ? settingsStore.startDay : 1
    currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: day })
    
    if (planStore.plan.length === 0) planStore.fetchPlan()
})

watch(checkedIds, (newVal) => {
    localStorage.setItem('shopping_checked_v1', JSON.stringify([...newVal]))
}, { deep: true })

const toggleCheck = (id) => {
    if (checkedIds.value.has(id)) checkedIds.value.delete(id)
    else checkedIds.value.add(id)
}

// --- 3. РАСЧЕТ ДАННЫХ ---
const activePlanItems = computed(() => {
    const start = currentWeekStart.value
    const end = addDays(start, periodLength.value - 1)
    start.setHours(0,0,0,0)
    end.setHours(23,59,59,999)

    return planStore.plan.filter(item => {
        const planDate = parseISO(item.date)
        planDate.setHours(0,0,0,0)
        if (!isWithinInterval(planDate, { start, end })) return false
        if (item.ignore_shopping) return false
        if (item.dish_id && !item.dishes) return false
        if (item.product_id && !item.products) return false
        return true
    })
})

const shoppingList = computed(() => {
  const list = {}
  
  activePlanItems.value.forEach(planItem => {
      const portions = planItem.portions || 1

      if (planItem.dish_id) {
          const ingredients = planItem.dishes.ingredients || []
          ingredients.forEach(ing => {
              if (!ing.products) return 
              addToAggregatedList(list, ing.products, (ing.amount || 0) * portions)
          })
      } 
      else if (planItem.product_id) {
           addToAggregatedList(list, planItem.products, portions)
      }
  })

  return Object.values(list)
})

const addToAggregatedList = (list, product, amount) => {
    if (!list[product.id]) {
        list[product.id] = {
            id: product.id,
            name: product.name,
            unit: product.unit,
            category: product.category || 'Разное',
            amount: 0
        }
    }
    list[product.id].amount += amount
}

// СТАТИСТИКА ПО БЛЮДАМ (ДЛЯ КАРУСЕЛИ)
// ИСПРАВЛЕНО: Группировка одинаковых блюд и расчет по уникальным ингредиентам
const dishStats = computed(() => {
    const dishesMap = new Map()
    
    activePlanItems.value.forEach(item => {
        if (!item.dish_id) return // Пропускаем отдельные продукты
        
        const dishId = item.dishes.id
        
        // Если такое блюдо уже есть в списке, просто увеличиваем счетчик
        if (dishesMap.has(dishId)) {
            dishesMap.get(dishId).count++
        } else {
            // Если нет - создаем запись и считаем прогресс по ингредиентам
            const ingredients = item.dishes.ingredients || []
            let totalIngs = 0
            let foundIngs = 0
            
            ingredients.forEach(ing => {
                if (!ing.products) return
                totalIngs++
                // Проверяем, есть ли этот продукт в списке купленных
                if (checkedIds.value.has(ing.product_id)) {
                    foundIngs++
                }
            })
            
            const percent = totalIngs > 0 ? (foundIngs / totalIngs) * 100 : 100
            
            dishesMap.set(dishId, {
                id: dishId,
                name: item.dishes.name,
                count: 1, // Начальный счетчик
                percent: percent
            })
        }
    })
    
    return Array.from(dishesMap.values())
})

const groupedList = computed(() => {
    const items = shoppingList.value
    if (activeTab.value === 'departments') {
        const groups = {}
        items.forEach(item => {
            const cat = item.category
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(item)
        })
        return groups
    } else {
        return { 'Все': items.sort((a, b) => a.name.localeCompare(b.name)) }
    }
})

const totalItems = computed(() => shoppingList.value.length)
const countChecked = computed(() => shoppingList.value.filter(i => checkedIds.value.has(i.id)).length)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-10 sticky top-0 overflow-hidden flex flex-col">
      
      <div class="px-5 pt-12 pb-2 flex items-center justify-between">
        <h1 class="text-3xl font-bold text-slate-900 tracking-tight">Купить</h1>
        
        <div class="flex gap-2">
            <button @click="planStore.fetchPlan()" class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 tap-effect">
                <span class="material-icons-round" :class="planStore.loading ? 'animate-spin' : ''">refresh</span>
            </button>
            <div class="bg-slate-50 p-1 rounded-xl flex">
                <button @click="activeTab = 'list'" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all" :class="activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">format_list_bulleted</span>
                </button>
                <button @click="activeTab = 'departments'" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all" :class="activeTab === 'departments' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">grid_view</span>
                </button>
            </div>
        </div>
      </div>

      <div class="px-5 pb-4">
          <div class="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-2xl">
            <button @click="changePeriod(-1)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                <span class="material-icons-round text-sm">chevron_left</span>
            </button>
            <span class="text-xs font-black text-slate-800 uppercase tracking-widest">{{ periodLabel }}</span>
            <button @click="changePeriod(1)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                <span class="material-icons-round text-sm">chevron_right</span>
            </button>
          </div>
      </div>

      <div v-if="dishStats.length > 0" class="pl-5 pb-4 overflow-x-auto no-scrollbar flex gap-2">
          <div 
            v-for="dish in dishStats" 
            :key="dish.id"
            class="min-w-[130px] max-w-[130px] bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm flex flex-col justify-center gap-1.5 h-14"
          >
              <div class="flex items-center justify-between w-full">
                  <div class="text-xs font-bold text-slate-700 truncate leading-tight pr-1">
                      {{ dish.name }}
                  </div>
                  <div v-if="dish.count > 1" class="text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 rounded-md whitespace-nowrap">
                      x{{ dish.count }}
                  </div>
              </div>

              <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    class="h-full rounded-full transition-all duration-500" 
                    :class="dish.percent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'"
                    :style="{ width: dish.percent + '%' }"
                  ></div>
              </div>
          </div>
      </div>

      <div class="h-1 w-full bg-slate-100">
          <div class="h-full bg-slate-900 transition-all duration-500" :style="{ width: (totalItems > 0 ? (countChecked / totalItems * 100) : 0) + '%' }"></div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-6 pb-24">
        
        <div v-if="totalItems === 0" class="h-full flex flex-col items-center justify-center text-center opacity-40 -mt-10">
            <span class="text-5xl mb-4">🛒</span>
            <p class="font-bold text-slate-400">Список пуст</p>
            <p class="text-xs text-slate-300 mt-2 max-w-[200px]">Добавьте блюда в план или уберите галочки "Не покупать"</p>
        </div>

        <div v-else class="space-y-6">
            <div v-for="(items, category) in groupedList" :key="category">
                <h3 v-if="activeTab === 'departments'" class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">{{ category }}</h3>
                
                <div class="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden">
                    <div 
                        v-for="item in items" 
                        :key="item.id" 
                        class="flex items-center p-4 border-b border-slate-50 last:border-0 group cursor-pointer tap-effect" 
                        @click="toggleCheck(item.id)"
                    >
                        <div 
                            class="w-6 h-6 rounded-lg border-2 mr-4 flex items-center justify-center transition-all duration-200" 
                            :class="checkedIds.has(item.id) ? 'bg-slate-900 border-slate-900 scale-110' : 'border-slate-200 bg-slate-50'"
                        >
                             <span v-if="checkedIds.has(item.id)" class="material-icons-round text-white text-xs font-bold">check</span>
                        </div>
                        
                        <div class="flex-1 font-bold text-slate-700 text-sm transition-all duration-200" :class="checkedIds.has(item.id) ? 'opacity-30 line-through' : ''">
                            {{ item.name }}
                        </div>
                        
                        <div class="text-xs font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100" :class="checkedIds.has(item.id) ? 'opacity-30' : ''">
                            {{ Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1) }} {{ item.unit }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>