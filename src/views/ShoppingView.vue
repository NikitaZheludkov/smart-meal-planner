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

const expandedProductIds = ref(new Set())
const toggleExpand = (id) => {
    if (expandedProductIds.value.has(id)) expandedProductIds.value.delete(id)
    else {
        expandedProductIds.value.add(id)
        telegram.haptic.selection()
    }
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
                  name: planItem.dishes?.name,
                  is_batch: planItem.dishes?.is_batch,
                  batch_yield: planItem.dishes?.batch_yield || 1,
                  ingredients: planItem.dishes?.ingredients || [],
                  totalPortions: 0
              }
          }
          dishesMap[dishId].totalPortions += portions
      } 
      else if (planItem.product_id) {
           addToAggregatedList(finalList, planItem.products, portions, 'Отдельно')
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
          addToAggregatedList(finalList, ing.products, (ing.amount || 0) * multiplier, dish.name)
      })
  })

  return Object.values(finalList).map(item => ({
      ...item,
      dishes: Array.from(item.dishes)
  }))
})

const addToAggregatedList = (list, product, amount, dishName) => {
    if (!list[product.id]) {
        list[product.id] = {
            id: product.id,
            name: product.name,
            unit: product.unit,
            category: product.category || 'Разное',
            amount: 0,
            dishes: new Set()
        }
    }
    list[product.id].amount += amount
    if (dishName) list[product.id].dishes.add(dishName)
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
                image_url: item.dishes.image_url,
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
const resetChecks = () => {
    if (confirm('Снять все отметки?')) {
        checkedIds.value.clear()
        telegram.haptic.impact('medium')
    }
}

const copyList = () => {
    const text = shoppingList.value
        .map(item => `${item.name} - ${formatAmount(item.amount)} ${item.unit}`)
        .join('\n')
    
    navigator.clipboard.writeText(text).then(() => {
        telegram.haptic.notification('success')
        alert('Список скопирован!')
    })
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
      
      <div class="px-5 pt-app-header pb-4 flex flex-col gap-4">
          
        <!-- Date Switcher Full Width -->
        <div class="flex items-center justify-between px-2 w-full">
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

        <!-- Controls Row -->
        <div class="flex items-center gap-2 w-full h-10">
            <!-- View Switcher -->
            <div class="flex-1 bg-slate-50 border border-slate-100 p-0.5 rounded-xl flex items-center h-full">
                <button @click="switchViewTab('list')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-all" :class="activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">format_list_bulleted</span>
                </button>
                <button @click="switchViewTab('departments')" class="flex-1 h-full rounded-[10px] flex items-center justify-center transition-all" :class="activeTab === 'departments' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'">
                    <span class="material-icons-round text-lg">grid_view</span>
                </button>
            </div>

            <!-- Reset Checks Button -->
             <button @click="resetChecks" class="h-full flex-1 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 tap-effect hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-colors">
                <span class="material-icons-round text-xl">remove_done</span>
            </button>

            <!-- Copy List Button -->
            <button @click="copyList" class="h-full flex-1 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 font-bold text-sm tap-effect">
                <span class="material-icons-round text-lg">content_copy</span>
            </button>
        </div>
      </div>

      <div v-if="dishStats.length > 0" class="pl-5 pb-4 overflow-x-auto no-scrollbar flex gap-2">
          <div 
            v-for="dish in dishStats" 
            :key="dish.id"
            class="relative w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden shadow-sm border border-slate-100 bg-white tap-effect flex items-center justify-center p-0.5"
          >
              <!-- Dish Name -->
              <div class="text-[7px] font-bold text-center leading-tight text-slate-700 line-clamp-4 break-words w-full pb-1">
                  {{ dish.name }}
              </div>
              
              <!-- Progress Overlay (Bottom Bar) -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                  <div 
                    class="h-full transition-all duration-500" 
                    :class="dish.percent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'"
                    :style="{ width: dish.percent + '%' }"
                  ></div>
              </div>

              <!-- Count Badge -->
              <div v-if="dish.count > 1" class="absolute top-0 right-0 bg-indigo-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg shadow-sm leading-none z-10">
                  x{{ dish.count }}
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
                                class="flex flex-col border-b border-slate-50 last:border-0 w-full bg-white transition-colors duration-200"
                                :class="expandedProductIds.has(item.id) ? 'bg-slate-50/50' : ''"
                            >
                                <div class="flex items-center px-4 py-2 w-full min-h-[44px]">
                                    <!-- Checkbox Area -->
                                    <div 
                                        class="w-8 h-8 -ml-1.5 flex items-center justify-center cursor-pointer tap-effect rounded-full active:bg-slate-100 transition-colors flex-shrink-0"
                                        @click.stop="toggleCheck(item.id)"
                                    >
                                        <div 
                                            class="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200" 
                                            :class="checkedIds.has(item.id) ? 'bg-slate-900 border-slate-900 scale-110' : 'border-slate-200 bg-slate-50'"
                                        >
                                            <span v-if="checkedIds.has(item.id)" class="material-icons-round text-white text-[10px] font-bold">check</span>
                                        </div>
                                    </div>
                                    
                                    <!-- Content Area (Expandable) -->
                                    <div class="flex-1 flex items-center cursor-pointer tap-effect min-w-0 h-full py-0.5" @click="item.dishes.length ? toggleExpand(item.id) : toggleCheck(item.id)">
                                         <div class="flex-1 font-bold text-slate-700 text-xs transition-all duration-200 truncate pr-2 leading-tight" :class="checkedIds.has(item.id) ? 'opacity-30 line-through' : ''">
                                            {{ item.name }}
                                        </div>
                                        
                                        <div class="text-[10px] font-black text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100 whitespace-nowrap flex-shrink-0" :class="checkedIds.has(item.id) ? 'opacity-30' : ''">
                                            {{ formatAmount(item.amount) }} {{ item.unit }}
                                        </div>
                                    </div>
                                </div>

                                <!-- Expansion Content -->
                                <div v-if="expandedProductIds.has(item.id) && item.dishes.length > 0" class="px-4 pb-3 pl-10">
                                    <div class="flex flex-wrap gap-1">
                                        <div v-for="dishName in item.dishes" :key="dishName" class="text-[9px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shadow-sm">
                                            {{ dishName }}
                                        </div>
                                    </div>
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
