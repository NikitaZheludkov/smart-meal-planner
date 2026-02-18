<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import { useSettingsStore } from '../stores/settings'
import { useTelegramStore } from '../stores/telegram' // <-- Импорт
import { startOfWeek, addDays, format, isWithinInterval, parseISO, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

const planStore = usePlanStore()
const settingsStore = useSettingsStore()
const telegram = useTelegramStore() // <-- Инит

const activeTab = ref('list') 
const transitionName = ref('slide-left')

// --- 1. УПРАВЛЕНИЕ ПЕРИОДОМ ---
const currentWeekStart = ref(new Date())
const periodLength = computed(() => settingsStore.periodLength || 7)

const periodLabel = computed(() => {
    const start = currentWeekStart.value
    const end = addDays(start, periodLength.value - 1)
    return `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`
})

const changePeriod = (dir) => {
    telegram.haptic.selection() // <-- Вибрация "барабан" при смене дат
    currentWeekStart.value = addDays(currentWeekStart.value, dir * periodLength.value)
}

const showTodayBtn = computed(() => {
    const userStartDay = settingsStore.startDay !== null ? settingsStore.startDay : 1
    const realCurrentWeekStart = startOfWeek(new Date(), { weekStartsOn: userStartDay })
    return !isSameDay(currentWeekStart.value, realCurrentWeekStart)
})

const goToToday = () => {
    const day = settingsStore.startDay !== null ? settingsStore.startDay : 1
    currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: day })
    telegram.haptic.selection()
}

// --- 2. ЛОГИКА ГАЛОЧЕК ---
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
    // Средний удар - как щелчок выключателя
    telegram.haptic.impact('medium')
    
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
  const dishesMap = {} // Группировка по блюдам для расчета батчей
  const finalList = {} // Итоговый список продуктов
  
  activePlanItems.value.forEach(planItem => {
      const portions = planItem.portions || 1

      if (planItem.dish_id) {
          const dishId = planItem.dish_id
          if (!dishesMap[dishId]) {
              dishesMap[dishId] = {
                  is_batch: planItem.dishes?.is_batch,
                  batch_yield: planItem.dishes?.batch_yield || 1,
                  ingredients: planItem.dishes?.ingredients || [],
                  totalPortions: 0
              }
          }
          dishesMap[dishId].totalPortions += portions
      } 
      else if (planItem.product_id) {
           addToAggregatedList(finalList, planItem.products, portions)
      }
  })

  // Обрабатываем сгруппированные блюда
  Object.values(dishesMap).forEach(dish => {
      let multiplier = dish.totalPortions
      
      if (dish.is_batch && dish.batch_yield > 0) {
          // Для пакетных блюд: кол-во готовок = ceil(всего порций / выход с одной готовки)
          // Ингредиенты берем на одну готовку (они так хранятся в базе для batch блюд)
          multiplier = Math.ceil(dish.totalPortions / dish.batch_yield)
      }
      
      dish.ingredients.forEach(ing => {
          if (!ing.products) return 
          addToAggregatedList(finalList, ing.products, (ing.amount || 0) * multiplier)
      })
  })

  return Object.values(finalList)
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

const dishStats = computed(() => {
    const dishesMap = new Map()
    
    activePlanItems.value.forEach(item => {
        if (!item.dish_id) return 
        
        const dishId = item.dishes.id
        
        if (dishesMap.has(dishId)) {
            dishesMap.get(dishId).count++
        } else {
            const ingredients = item.dishes.ingredients || []
            let totalIngs = 0
            let foundIngs = 0
            
            ingredients.forEach(ing => {
                if (!ing.products) return
                totalIngs++
                if (checkedIds.value.has(ing.product_id)) {
                    foundIngs++
                }
            })
            
            const percent = totalIngs > 0 ? (foundIngs / totalIngs) * 100 : 100
            
            dishesMap.set(dishId, {
                id: dishId,
                name: item.dishes.name,
                count: 1, 
                percent: percent
            })
        }
    })
    
    return Array.from(dishesMap.values())
})

const groupedList = computed(() => {
    const items = [...shoppingList.value]
    
    const sorter = (a, b) => {
        const aChecked = checkedIds.value.has(a.id)
        const bChecked = checkedIds.value.has(b.id)
        
        if (aChecked !== bChecked) {
            return aChecked ? 1 : -1
        }
        return a.name.localeCompare(b.name)
    }
    
    if (activeTab.value === 'departments') {
        const groups = {}
        items.sort(sorter).forEach(item => {
            const cat = item.category
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(item)
        })
        return groups
    } else {
        return { 'Все': items.sort(sorter) }
    }
})

const totalItems = computed(() => shoppingList.value.length)
const countChecked = computed(() => shoppingList.value.filter(i => checkedIds.value.has(i.id)).length)

const switchViewTab = (mode) => {
    if(activeTab.value !== mode) {
        transitionName.value = mode === 'departments' ? 'slide-left' : 'slide-right'
        telegram.haptic.selection()
        activeTab.value = mode
    }
}
const formatAmount = (val) => {
    // Если число целое, возвращаем как есть
    if (Number.isInteger(val)) return val
    
    // Если число меньше 0.001 (но не 0), то покажем <0.001 (или просто 0.001)
    // Но по условию задачи нам нужно до 3 знаков
    
    // Преобразуем в строку с 3 знаками, потом убираем лишние нули
    // parseFloat(val.toFixed(3)) автоматически уберет "хвосты" типа 1.500 -> 1.5
    return parseFloat(val.toFixed(3))
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-10 relative overflow-hidden flex flex-col border-b border-slate-100">
      
      <div class="px-5 pt-app-header pb-4 flex items-center gap-2">
          
        <div class="flex-1 flex items-center justify-between px-2">
            <button @click="changePeriod(-1)" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
                <span class="material-icons-round">chevron_left</span>
            </button>
            
            <div class="flex flex-col items-center tap-effect" @click="goToToday">
                <div class="text-sm font-black text-slate-900 flex items-center gap-2">
                    {{ periodLabel }}
                </div>
                <div v-if="showTodayBtn" class="text-[10px] font-bold text-orange-500 mt-0.5">
                    Вернуться
                </div>
            </div>

            <button @click="changePeriod(1)" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all tap-effect">
                <span class="material-icons-round">chevron_right</span>
            </button>
        </div>

        <div class="flex gap-2">
            <button @click="planStore.fetchPlan(); telegram.haptic.impact('light')" class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 tap-effect">
                <span class="material-icons-round" :class="planStore.loading ? 'animate-spin' : ''">refresh</span>
            </button>
            <div class="bg-slate-50 border border-slate-100 p-1 rounded-2xl flex h-12 items-center">
                <button @click="switchViewTab('list')" class="w-10 h-10 rounded-xl flex items-center justify-center transition-all" :class="activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">format_list_bulleted</span>
                </button>
                <button @click="switchViewTab('departments')" class="w-10 h-10 rounded-xl flex items-center justify-center transition-all" :class="activeTab === 'departments' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">grid_view</span>
                </button>
            </div>
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

    <div class="flex-1 relative overflow-hidden">
        <transition :name="transitionName">
            <div :key="activeTab" class="absolute inset-0 overflow-y-auto px-5 pt-4 pb-[76px] scroll-area w-full">
                
                <div v-if="totalItems === 0" class="h-full flex flex-col items-center justify-center text-center opacity-40 -mt-10">
                    <span class="text-5xl mb-4">🛒</span>
                    <p class="font-bold text-slate-400">Список пуст</p>
                    <p class="text-xs text-slate-300 mt-2 max-w-[200px]">Добавьте блюда в план или уберите галочки "Не покупать"</p>
                </div>

                <div v-else class="space-y-6">
                    <div v-for="(items, category) in groupedList" :key="category">
                        <h3 v-if="activeTab === 'departments'" class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">{{ category }}</h3>
                        
                        <TransitionGroup name="list" tag="div" class="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden relative">
                            <div 
                                v-for="item in items" 
                                :key="item.id" 
                                class="flex items-center p-4 border-b border-slate-50 last:border-0 group cursor-pointer tap-effect w-full" 
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
                                    {{ formatAmount(item.amount) }} {{ item.unit }}
                                </div>
                            </div>
                        </TransitionGroup>
                    </div>
                </div>

            </div>
        </transition>
    </div>
  </div>
</template>
