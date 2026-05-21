<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { useTelegramStore } from '../stores/telegram'
import DishDetailModal from '../components/DishDetailModal.vue'
import DishFilterModal from '../components/DishFilterModal.vue'

const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  }
})

const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const uiStore = useUIStore()
const telegram = useTelegramStore()

// Анимация перелистывания
const transitionName = ref('slide-left')

// Получаем индекс приема пищи (все = 0)
const getMealTypeIndex = (id) => {
  if (id === null) return 0
  const index = dictionaries.mealTypes.findIndex(m => m.id === id)
  return index !== -1 ? index + 1 : 0
}

// Слушаем изменение activeTag для определения направления анимации
watch(() => uiStore.dishes.activeTag, (newId, oldId) => {
  const newIndex = getMealTypeIndex(newId)
  const oldIndex = getMealTypeIndex(oldId)
  transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right'
})

// Состояние модалок
const showDetailModal = ref(false)
const showFilterModal = ref(false)
const viewingDish = ref(null)
const tagById = computed(() => new Map((dictionaries.availableTags || []).map((t) => [t.id, t])))

const openDish = (dish) => {
  viewingDish.value = dish
  showDetailModal.value = true
}

const openCreateDish = () => {
  viewingDish.value = {
      id: null, 
      name: '',
      dish_type: uiStore.dishes.activeCategory !== 'all' ? uiStore.dishes.activeCategory : dictionaries.dishTypes[0]?.id, 
      meal_type: uiStore.dishes.activeTag ? uiStore.dishes.activeTag : (dictionaries.mealTypes[1]?.id || dictionaries.mealTypes[0]?.id), 
      kcal: null, protein: null, fat: null, carbs: null,
      tags: [],
      ingredients: []
  }
  showDetailModal.value = true
}

const openFilters = () => {
    telegram.haptic.impact('light')
    showFilterModal.value = true
}

onMounted(async () => {
  const promises = []
  if (dishStore.dishes.length === 0) promises.push(dishStore.fetchDishes())
  if (productStore.products.length === 0) promises.push(productStore.fetchProducts())
  promises.push(dictionaries.fetchDictionaries())
  await Promise.all(promises)
})

// --- ЛОГИКА ФИЛЬТРАЦИИ ---
const filteredDishes = computed(() => {
  let result = dishStore.dishes
  
  // 1. Поиск (самый приоритетный)
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase()
    result = result.filter(d => d.name.toLowerCase().includes(q))
  }

  // 2. Прием пищи (Завтрак/Обед...)
  if (uiStore.dishes.activeTag) {
    result = result.filter(d => d.meal_type === uiStore.dishes.activeTag)
  }

  // 3. Категория (Суп/Второе...)
  if (uiStore.dishes.activeCategory !== 'all') {
    result = result.filter(d => d.dish_type === uiStore.dishes.activeCategory)
  }

  // 4. ТЕГИ (Множественный выбор, логика AND)
  if (uiStore.dishes.filterTags.length > 0) {
      result = result.filter(dish => {
          const dishTagIds = Array.isArray(dish.tags) ? dish.tags : []
          return uiStore.dishes.filterTags.every(tagId => dishTagIds.includes(tagId))
      })
  }
  
  return result
})
</script>

<template>
  <div class="h-full bg-slate-50 flex flex-col relative">

    <div class="flex-1 relative overflow-hidden">
      
      <div v-if="filteredDishes.length === 0" class="text-center py-20 opacity-40 absolute inset-0 pointer-events-none z-10">
        <div class="text-5xl mb-2">🍳</div>
        <p class="font-bold text-slate-400">Ничего не найдено</p>
        <p v-if="uiStore.dishes.filterTags.length > 0" class="text-xs text-slate-300 mt-1">Попробуйте сбросить теги</p>
      </div>

      <Transition :name="transitionName">
        <div :key="uiStore.dishes.activeTag || 'all'" class="absolute inset-0 w-full h-full overflow-y-auto px-5 pt-4 pb-app-nav scroll-area">
          <div class="space-y-3 relative min-h-full">
            <div 
                v-for="dish in filteredDishes" 
                :key="dish.id" 
                @click="openDish(dish)" 
                class="bg-white p-5 rounded-[24px] shadow-sm flex flex-col gap-2 tap-effect border border-slate-100/50 relative group w-full"
            >
                <div class="flex justify-between items-start">
                <span class="card-title leading-tight pr-8">{{ dish.name }}</span>
                <span class="text-[10px] font-normal bg-slate-50 text-secondary px-2 py-1 rounded-lg border border-slate-100">
                    {{ dictionaries.getDishTypeById(dish.dish_type)?.name || '...' }}
                </span>
                </div>
                
                <div class="flex flex-wrap gap-1 mt-1">
                    <span class="text-[10px] font-normal px-2 py-0.5 rounded-md border text-secondary bg-slate-100 border-slate-200">
                        {{ dictionaries.getMealTypeById(dish.meal_type)?.name || '...' }}
                    </span>
                    <span 
                        v-for="tagId in (dish.tags || []).slice(0, 3)" 
                        :key="tagId" 
                        class="text-[10px] font-normal px-2 py-0.5 rounded-md border text-secondary bg-slate-50 border-slate-100 flex items-center gap-1" 
                    >
                    {{ tagById.get(tagId)?.icon }} {{ tagById.get(tagId)?.name }}
                    </span>
                    <span v-if="(dish.tags || []).length > 3" class="text-[10px] font-normal text-secondary px-1 pt-0.5">+{{ (dish.tags || []).length - 3 }}</span>
                </div>
                
                <div class="flex gap-3 text-[10px] font-normal text-secondary mt-1">
                <span class="text-slate-900 font-bold">🔥 {{ dish.kcal || 0 }}</span>
                <span>Б {{ dish.protein || 0 }}</span>
                <span>Ж {{ dish.fat || 0 }}</span>
                <span>У {{ dish.carbs || 0 }}</span>
                </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <div class="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px)+16px)] right-5 z-[60]">
      <button 
        @click="openCreateDish" 
        class="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center tap-effect hover:scale-105 transition-transform"
      >
        <span class="material-icons-round text-3xl">add</span>
      </button>
    </div>

    <DishDetailModal 
       :is-open="showDetailModal" 
       :dish="viewingDish"
       @close="showDetailModal = false"
    />

    <DishFilterModal
        :is-open="showFilterModal"
        @close="showFilterModal = false"
    />

  </div>
</template>
