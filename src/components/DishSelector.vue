<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { usePlanStore } from '../stores/plan'
import { useDictionariesStore } from '../stores/dictionaries'
import { useTelegramStore } from '../stores/telegram'
import { useUIStore } from '../stores/ui'
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
const ui = useUIStore()

const activeMode = ref('dish') 
const searchQuery = ref('')
const activeCategory = ref('all')
const showSearchDropdown = ref(false)

onMounted(async () => {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    if (productStore.products.length === 0) await productStore.fetchProducts()
})

watch(() => props.isOpen, (newVal) => {
    ui.isModalOpen = newVal
})

watch(searchQuery, (newValue) => {
    showSearchDropdown.value = newValue.length > 0
})

const selectFromDropdown = (dish) => {
    selectItem(dish, 'dish')
    searchQuery.value = ''
    showSearchDropdown.value = false
}

const yesterdayDishIds = computed(() => {
    const ids = new Set()
    if (props.yesterdayItems && props.yesterdayItems.length > 0) {
        props.yesterdayItems.forEach(item => {
            if (item.dish_id) ids.add(item.dish_id)
        })
    }
    return ids
})

const recommendedDishes = computed(() => {
    if (activeMode.value !== 'dish' || searchQuery.value) return []
    
    return dishStore.dishes.filter(d => {
        // Не показываем уже выбранные
        if (props.existingItems.some(i => i.dish_id === d.id)) return false
        
        // Вчерашние или подходящие по слоту
        return yesterdayDishIds.value.has(d.id) || d.meal_type_id === props.slotId
    }).sort((a, b) => {
        // Сначала вчерашние, потом по слоту
        const isAYesterday = yesterdayDishIds.value.has(a.id)
        const isBYesterday = yesterdayDishIds.value.has(b.id)
        if (isAYesterday && !isBYesterday) return -1
        if (!isAYesterday && isBYesterday) return 1
        return 0
    })
})

const dropdownSearchResults = computed(() => {
    if (!searchQuery.value) return []
    
    const q = searchQuery.value.toLowerCase().trim()
    let list = dishStore.dishes

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.dish_id).filter(Boolean))
        list = list.filter(d => !selectedIds.has(d.id))
    }

    return list.filter(d => d.name.toLowerCase().includes(q))
})

const filteredDishes = computed(() => {
    let list = dishStore.dishes

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.dish_id).filter(Boolean))
        list = list.filter(d => !selectedIds.has(d.id))
    }

    // Если нет поиска, убираем рекомендации из общего списка
    if (!searchQuery.value) {
        const recIds = new Set(recommendedDishes.value.map(d => d.id))
        list = list.filter(d => !recIds.has(d.id))
    }

    if (activeCategory.value !== 'all') {
        list = list.filter(d => d.dish_type_id === activeCategory.value)
    }

    return list
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
  <div v-if="isOpen" class="fixed inset-0 z-[70] flex flex-col" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
    
    <div class="relative flex-1 mt-[var(--app-header-pt)] bg-slate-200 rounded-t-[32px] overflow-hidden flex flex-col shadow-2xl animate-slide-up">
      
      <div class="flex-1 bg-white rounded-t-[32px] flex flex-col overflow-hidden relative">
          
        <!-- Handle -->
        <div class="w-full pt-3 pb-1 shrink-0 z-20">
            <div class="w-12 h-1.5 bg-slate-100 rounded-full mx-auto"></div>
        </div>

        <!-- Sticky Header Section -->
        <div class="shrink-0 bg-white z-30 border-b border-slate-50 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <!-- Top Row: Slot Info + Done Button -->
            <div class="px-5 pb-3 flex justify-between items-center bg-white">
                <div class="min-w-0 flex-1 pr-4">
                    <h2 class="text-lg card-title truncate leading-tight">{{ getSlotName }}</h2>
                    <p class="text-[10px] font-bold text-slate-400">
                        {{ selectedDate ? format(new Date(selectedDate), 'd MMMM', { locale: ru }) : '' }}
                    </p>
                </div>
                <button @click="$emit('close')" class="btn-primary text-[11px] font-black py-2 px-5 shadow-md shrink-0">
                    Готово
                </button>
            </div>

            <!-- Search Row -->
            <div class="px-4 pb-3">
                <div class="relative group">
                    <span class="material-icons-round absolute left-3 top-2.5 text-slate-300 text-lg transition-colors group-focus-within:text-slate-900">search</span>
                    <input 
                        v-model="searchQuery" 
                        :placeholder="activeMode === 'dish' ? 'Поиск рецептов...' : 'Поиск продуктов...'" 
                        class="w-full pl-10 pr-10 py-2.5 bg-slate-50 rounded-2xl font-bold text-sm outline-none border-none placeholder:text-slate-300 focus:bg-slate-100 transition-colors"
                        @blur="setTimeout(() => showSearchDropdown = false, 200)"
                        @focus="searchQuery.length > 0 && (showSearchDropdown = true)"
                    >
                    <button 
                        v-if="searchQuery" 
                        @click="searchQuery = ''; telegram.haptic.selection()"
                        class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 tap-effect"
                    >
                        <span class="material-icons-round text-lg">close</span>
                    </button>
                    
                    <!-- Dropdown -->
                    <div v-if="showSearchDropdown && activeMode === 'dish' && dropdownSearchResults.length > 0" 
                         class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-60 z-50">
                        <button 
                            v-for="dish in dropdownSearchResults" 
                            :key="dish.id"
                            @mousedown="selectFromDropdown(dish)"
                            class="w-full text-left px-4 py-3 hover:bg-slate-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center group"
                        >
                            <span class="group-hover:text-slate-900 transition-colors">{{ dish.name }}</span>
                            <span v-if="dish.kcal" class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">🔥 {{ dish.kcal }}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Existing Items (Horizontal or Compact vertical) -->
            <div v-if="existingItems.length > 0" class="px-4 pb-3">
                <div class="bg-slate-50/80 rounded-2xl p-2 border border-slate-100">
                    <div class="text-[9px] font-black text-slate-400 px-1 mb-1.5 uppercase tracking-wider flex justify-between items-center">
                        <span>Выбрано ({{ existingItems.length }})</span>
                        <span class="material-icons-round text-xs">expand_more</span>
                    </div>
                    <div class="flex overflow-x-auto gap-2 no-scrollbar pb-0.5">
                        <div v-for="item in existingItems" :key="item.id" 
                            class="flex-shrink-0 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-sm animate-fade-in"
                        >
                            <span class="text-[11px] font-bold text-slate-700 max-w-[100px] truncate">
                                {{ item.dishes ? item.dishes.name : item.products?.name }}
                            </span>
                            <button @click="removeItem(item)" class="text-slate-300 hover:text-red-500 transition-colors">
                                <span class="material-icons-round text-sm">cancel</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Mode Switcher -->
            <div class="px-4 pb-3 flex gap-2">
                <div class="flex-1 bg-slate-100 p-1 rounded-xl flex font-bold text-[10px]">
                    <button 
                        @click="activeMode = 'dish'; telegram.haptic.selection()" 
                        class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
                        :class="activeMode === 'dish' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                    >
                        <span>🥘</span> Рецепты
                    </button>
                    <button 
                        @click="activeMode = 'product'; telegram.haptic.selection()" 
                        class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
                        :class="activeMode === 'product' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                    >
                        <span>🥦</span> Продукты
                    </button>
                </div>
            </div>
        </div>

        <!-- Filter Row (Horizontal Scroll) -->
        <div v-if="activeMode === 'dish'" class="shrink-0 bg-white px-4 py-2 border-b border-slate-50 flex overflow-x-auto gap-2 no-scrollbar">
            <button 
                @click="activeCategory = 'all'; telegram.haptic.selection()" 
                class="shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black border transition-colors tap-effect"
                :class="activeCategory === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-400 border-slate-200'"
            >
                Все
            </button>
            <button 
                v-for="cat in dictionaries.dishTypes" 
                :key="cat.id" 
                @click="activeCategory = cat.id; telegram.haptic.selection()" 
                class="shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black border transition-colors tap-effect"
                :class="activeCategory === cat.id ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-400 border-slate-200'"
            >
                {{ cat.name }}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto px-4 pb-10 bg-slate-50 relative">
            <Transition name="slide-fade" mode="out-in">
            <div v-if="activeMode === 'dish'" key="dish" class="space-y-4 pt-3">
                <div v-if="filteredDishes.length === 0 && recommendedDishes.length === 0" class="text-center py-10 text-slate-400 text-sm font-bold">
                    {{ searchQuery ? 'Ничего не найдено' : 'Список пуст' }}
                </div>

                <!-- Рекомендованные блюда -->
                <div v-if="recommendedDishes.length > 0" class="space-y-2">
                    <div class="flex items-center gap-2 px-1">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Рекомендуем</span>
                        <div class="h-px bg-slate-200 flex-1"></div>
                    </div>
                    
                    <div v-for="dish in recommendedDishes" :key="dish.id" @click="selectItem(dish, 'dish')"
                        class="p-3 rounded-2xl flex items-center gap-3 border transition-colors tap-effect active:scale-[0.98] bg-white shadow-sm"
                        :class="isYesterday(dish.id) ? 'border-indigo-200 ring-1 ring-indigo-50' : 'border-emerald-200 ring-1 ring-emerald-50'"
                    >
                        <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center text-xl border border-slate-100">
                            <img v-if="dish.image_url" :src="dish.image_url" class="w-full h-full object-cover">
                            <span v-else>🥘</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                                <span v-if="isYesterday(dish.id)" class="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 rounded border border-indigo-100 uppercase">Вчера</span>
                                <span v-else class="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-100 uppercase">{{ getSlotName }}</span>
                                <div class="card-title text-sm truncate">{{ dish.name }}</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-medium text-secondary bg-slate-100 px-1.5 py-0.5 rounded">{{ dish.dish_type_name }}</span>
                                <span class="text-[10px] font-bold text-orange-400">🔥 {{ dish.kcal }}</span>
                            </div>
                        </div>
                        <button class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md">
                            <span class="material-icons-round text-lg">add</span>
                        </button>
                    </div>
                </div>

                <!-- Основной список -->
                <div v-if="filteredDishes.length > 0" class="space-y-2">
                    <div v-if="recommendedDishes.length > 0" class="flex items-center gap-2 px-1 pt-2">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Все блюда</span>
                        <div class="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <TransitionGroup name="list" tag="div" class="space-y-2">
                    <div 
                        v-for="dish in filteredDishes" 
                        :key="dish.id"
                        @click="selectItem(dish, 'dish')"
                        class="p-2.5 rounded-2xl flex items-center gap-3 border bg-white border-slate-100 shadow-sm transition-colors tap-effect active:scale-[0.98]"
                    >
                        <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center text-xl border border-slate-100/50 relative">
                            <img v-if="dish.image_url" :src="dish.image_url" class="w-full h-full object-cover">
                            <span v-else>🥘</span>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="card-title text-sm truncate mb-0.5">{{ dish.name }}</div>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-medium text-secondary bg-slate-100 px-1.5 py-0.5 rounded">{{ dish.dish_type_name }}</span>
                                <span class="text-[10px] font-bold text-orange-400">🔥 {{ dish.kcal }}</span>
                            </div>
                        </div>

                        <button class="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 flex items-center justify-center shadow-sm">
                            <span class="material-icons-round text-lg">add</span>
                        </button>
                    </div>
                    </TransitionGroup>
                </div>
            </div>

            <div v-else key="product" class="space-y-4 pt-3">
                <div v-for="(products, catName) in groupedProducts" :key="catName">
                    <h3 class="text-[10px] font-black text-slate-400 mb-2 ml-1">{{ catName }}</h3>
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
  </div>
  </Transition>
</template>

<style scoped>
/* Removed animate-slide-up as it is handled by global modal transition */
.list-enter-active,
.list-leave-active {
  transition: opacity var(--dur-fast) var(--easing-base), transform var(--dur-fast) var(--easing-base);
}
.list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
.list-leave-active {
  position: absolute;
  width: 100%;
}
.list-move {
  transition: transform var(--dur-fast) var(--easing-base);
}
</style>