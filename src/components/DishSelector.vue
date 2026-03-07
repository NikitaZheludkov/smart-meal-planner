<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { usePlanStore } from '../stores/plan'
import { useDictionariesStore } from '../stores/dictionaries'
import { useTelegramStore } from '../stores/telegram'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

const props = defineProps({
  isOpen: Boolean,
  selectedDate: [Date, String],
  slotId: String, 
  existingItems: {     
      type: Array,
      default: () => []
  },
  yesterdayItems: {
      type: Array,
      default: () => []
  }
})

const emit = defineEmits(['close', 'select'])

const dishStore = useDishStore()
const productStore = useProductStore()
const planStore = usePlanStore()
const dictionaries = useDictionariesStore()
const telegram = useTelegramStore()

const activeMode = ref('dish') 
const searchQuery = ref('')
const activeCategory = ref('all')

onMounted(async () => {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    if (productStore.products.length === 0) await productStore.fetchProducts()
})

const yesterdayDishIds = computed(() => {
    const ids = new Set()
    if (props.yesterdayItems && props.yesterdayItems.length > 0) {
        props.yesterdayItems.forEach(item => {
            if (item.dish_id) ids.add(item.dish_id)
        })
    }
    return ids
})

const filteredDishes = computed(() => {
    let list = dishStore.dishes

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.dish_id).filter(Boolean))
        list = list.filter(d => !selectedIds.has(d.id))
    }

    if (activeCategory.value !== 'all') {
        list = list.filter(d => d.dish_type_id === activeCategory.value)
    }

    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(d => d.name.toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
        const isAYesterday = yesterdayDishIds.value.has(a.id)
        const isBYesterday = yesterdayDishIds.value.has(b.id)
        if (isAYesterday && !isBYesterday) return -1
        if (!isAYesterday && isBYesterday) return 1

        const isAMatch = a.meal_type_id === props.slotId
        const isBMatch = b.meal_type_id === props.slotId
        
        if (isAMatch && !isBMatch) return -1
        if (!isAMatch && isBMatch) return 1

        return 0 
    })
})

const groupedProducts = computed(() => {
    let list = productStore.products

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.product_id).filter(Boolean))
        list = list.filter(p => !selectedIds.has(p.id))
    }
    
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(p => p.name.toLowerCase().includes(q))
    }

    const groups = {}
    list.forEach(p => {
        const cat = p.category || 'Разное'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(p)
    })
    
    return groups
})

const selectItem = (item, type) => {
    telegram.haptic.selection()
    emit('select', { item, type })
}

const updatePortions = (item, delta) => {
    telegram.haptic.selection()
    const newPortions = Math.max(1, (item.portions || 1) + delta)
    planStore.updatePlanItem(item.id, { portions: newPortions })
}

const toggleShopping = (item) => {
    telegram.haptic.impact('medium')
    planStore.updatePlanItem(item.id, { 
        ignore_shopping: !item.ignore_shopping 
    })
}

const removeItem = (item) => {
    telegram.haptic.notification('warning')
    planStore.removeFromPlan(item.id)
}

const getSlotName = computed(() => {
    const slot = dictionaries.mealTypes.find(m => m.id === props.slotId)
    return slot ? slot.name : 'Прием пищи'
})

const isYesterday = (id) => yesterdayDishIds.value.has(id)
const isSlotMatch = (dishMealTypeId) => dishMealTypeId === props.slotId
const getDishSlotName = (id) => {
    const slot = dictionaries.mealTypes.find(m => m.id === id)
    return slot ? slot.name : ''
}
</script>

<template>
  <Transition name="modal">
  <div v-if="isOpen" class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
    
    <div class="bg-white w-full max-w-sm h-full max-h-[calc(100%-96px)] rounded-t-[40px] sm:rounded-[40px] shadow-2xl relative z-10 flex flex-col overflow-hidden modal-content">
      
      <!-- Handle -->
      <div class="w-full bg-white pt-2 pb-1 shrink-0 z-20 rounded-t-[40px]">
          <div class="modal-handle"></div>
      </div>

      <div class="px-5 pb-3 flex justify-between items-center shrink-0 bg-white z-20 shadow-sm border-b border-slate-50">
          <div>
              <h2 class="text-xl card-title">{{ getSlotName }}</h2>
              <p class="text-[11px] font-bold text-slate-400">
                  {{ selectedDate ? format(new Date(selectedDate), 'd MMMM', { locale: ru }) : '' }}
              </p>
          </div>
          <button @click="$emit('close')" class="btn-primary text-xs font-bold shadow-lg">
              Готово
          </button>
      </div>

      <div v-if="existingItems.length > 0" class="shrink-0 bg-slate-50/50 border-b border-slate-100 max-h-[40vh] overflow-y-auto no-scrollbar">
          <div class="px-4 py-4 space-y-3">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Выбрано ({{ existingItems.length }})</div>
              
              <div v-for="item in existingItems" :key="item.id" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 relative overflow-hidden">
                  <div class="flex justify-between items-start mb-3">
                      <div class="pr-8">
                          <div class="card-title text-base leading-tight line-clamp-2">
                              {{ item.dishes ? item.dishes.name : item.products?.name }}
                          </div>
                          <div v-if="item.dishes" class="text-[10px] font-bold text-orange-400 mt-0.5">
                              🔥 {{ item.dishes.kcal }} ккал
                          </div>
                      </div>
                      <button @click="removeItem(item)" class="text-slate-400 p-2 -mr-2 -mt-2 hover:bg-slate-100 rounded-lg transition-colors">
                          <span class="material-icons-outlined text-lg">delete</span>
                      </button>
                  </div>

                  <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center bg-slate-50 rounded-xl h-9 border border-slate-100 px-1">
                           <button @click="updatePortions(item, -1)" class="w-8 h-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                               <span class="material-icons-round text-sm">remove</span>
                           </button>
                           <div class="text-sm font-black text-slate-900 w-6 text-center">
                               {{ item.portions }}
                           </div>
                           <button @click="updatePortions(item, 1)" class="w-8 h-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                               <span class="material-icons-round text-sm">add</span>
                           </button>
                      </div>

                      <button 
                        @click="toggleShopping(item)"
                        class="flex-1 flex items-center gap-2 h-9 px-2 rounded-xl bg-slate-50 border border-slate-100 tap-effect transition-colors"
                        :class="item.ignore_shopping ? 'bg-slate-100 border-slate-200' : ''"
                      >
                          <div 
                            class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0"
                            :class="item.ignore_shopping ? 'bg-slate-900 border-slate-900' : 'border-slate-300 bg-white'"
                          >
                              <span v-if="item.ignore_shopping" class="material-icons-round text-white text-[10px] font-bold">check</span>
                          </div>
                          <span class="text-[9px] font-bold text-slate-500 leading-none text-left pt-0.5">
                              Не покупать
                          </span>
                      </button>
                  </div>
              </div>
          </div>
      </div>

      <div class="px-4 py-2 bg-white z-10 shrink-0 space-y-3 shadow-[0_4px_12px_rgba(0,0,0,0.02)] border-b border-slate-50">
          <div class="bg-slate-100 p-1 rounded-full flex font-bold text-xs">
              <button 
                @click="activeMode = 'dish'; telegram.haptic.selection()" 
                class="flex-1 py-2 rounded-full transition-all duration-200"
                :class="activeMode === 'dish' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
              >
                  🥘 Рецепты
              </button>
              <button 
                @click="activeMode = 'product'; telegram.haptic.selection()" 
                class="flex-1 py-2 rounded-full transition-all duration-200"
                :class="activeMode === 'product' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
              >
                  🥦 Продукты
              </button>
          </div>

          <div class="relative">
             <span class="material-icons-round absolute left-3 top-3.5 text-slate-400 text-lg">search</span>
             <input 
                v-model="searchQuery" 
                placeholder="Поиск рецептов..." 
                class="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm outline-none border-none placeholder:text-slate-300"
             >
             <button 
                v-if="searchQuery" 
                @click="searchQuery = ''; telegram.haptic.selection()"
                class="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 tap-effect"
            >
                <span class="material-icons-round text-lg">close</span>
            </button>
          </div>

          <div v-if="activeMode === 'dish'" class="flex overflow-x-auto gap-2 no-scrollbar pb-1 -mx-4 px-4">
              <button 
                  @click="activeCategory = 'all'; telegram.haptic.selection()" 
                  class="shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all tap-effect"
                  :class="activeCategory === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
              >
                  Все
              </button>
              <button 
                  v-for="cat in dictionaries.dishTypes" 
                  :key="cat.id" 
                  @click="activeCategory = cat.id; telegram.haptic.selection()" 
                  class="shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all tap-effect"
                  :class="activeCategory === cat.id ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
              >
                  {{ cat.name }}
              </button>
          </div>
      </div>

      <div class="flex-1 overflow-y-auto px-4 pb-10 bg-slate-50 relative">
          <Transition name="slide-fade" mode="out-in">
          <div v-if="activeMode === 'dish'" key="dish" class="space-y-2 pt-3">
              <div v-if="filteredDishes.length === 0" class="text-center py-10 text-slate-400 text-sm font-bold">
                  {{ searchQuery ? 'Ничего не найдено' : 'Список пуст' }}
              </div>

              <TransitionGroup name="list" tag="div" class="space-y-2">
              <div 
                v-for="dish in filteredDishes" 
                :key="dish.id"
                @click="selectItem(dish, 'dish')"
                class="p-2.5 rounded-2xl flex items-center gap-3 border transition-all tap-effect active:scale-[0.98]"
                :class="[
                    isYesterday(dish.id) ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 
                    isSlotMatch(dish.meal_type_id) ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-white border-slate-100 shadow-sm'
                ]"
              >
                  <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white flex items-center justify-center text-xl border border-slate-100/50 relative">
                      <img v-if="dish.image_url" :src="dish.image_url" class="w-full h-full object-cover">
                      <span v-else>🥘</span>
                  </div>

                  <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                           <span v-if="isYesterday(dish.id)" class="text-[9px] font-black text-indigo-500 bg-white px-1.5 rounded border border-indigo-100 uppercase tracking-wide">Вчера</span>
                           <span v-else-if="isSlotMatch(dish.meal_type_id)" class="text-[9px] font-black text-emerald-600 bg-white px-1.5 rounded border border-emerald-200 uppercase tracking-wide">
                               {{ getDishSlotName(dish.meal_type_id) }}
                           </span>
                           <div class="card-title text-sm truncate">{{ dish.name }}</div>
                      </div>
                      
                      <div class="flex items-center gap-2">
                          <span class="text-[10px] font-medium text-secondary bg-slate-100 px-1.5 py-0.5 rounded">{{ dish.dish_type_name }}</span>
                          <span class="text-[10px] font-bold text-orange-400">🔥 {{ dish.kcal }}</span>
                      </div>
                  </div>

                  <button 
                    class="w-8 h-8 rounded-full bg-white border flex items-center justify-center shadow-sm"
                    :class="isSlotMatch(dish.meal_type_id) && !isYesterday(dish.id) ? 'text-emerald-500 border-emerald-100' : 'text-indigo-500 border-slate-100'"
                  >
                      <span class="material-icons-round text-lg">add</span>
                  </button>
              </div>
              </TransitionGroup>
          </div>

          <div v-else key="product" class="space-y-4 pt-3">
              <div v-for="(products, catName) in groupedProducts" :key="catName">
                  <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{{ catName }}</h3>
                  <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div 
                        v-for="prod in products" 
                        :key="prod.id"
                        @click="selectItem(prod, 'product')"
                        class="flex items-center justify-between p-3 border-b border-slate-50 last:border-0 active:bg-slate-50 transition-colors"
                      >
                          <div class="flex items-center gap-3">
                              <div class="text-xl">🥦</div>
                              <span class="card-title text-sm">{{ prod.name }}</span>
                          </div>
                          <button class="w-7 h-7 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center">
                              <span class="material-icons-round text-sm">add</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
          </Transition>
      </div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
/* Removed animate-slide-up as it is handled by global modal transition */
</style>