<script setup>
import { ref, onMounted, computed } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { useTelegramStore } from '../stores/telegram'
import DishDetailModal from '../components/DishDetailModal.vue'
import DishFilterModal from '../components/DishFilterModal.vue'

const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const uiStore = useUIStore()
const telegram = useTelegramStore()

// Справочники для фильтров
const dishCategories = computed(() => dictionaries.dishTypes)
const mealTypes = computed(() => dictionaries.mealTypes)

// Состояние модалок
const showDetailModal = ref(false)
const showFilterModal = ref(false)
const viewingDish = ref(null)

const openDish = (dish) => {
  viewingDish.value = dish
  showDetailModal.value = true
}

const openCreateDish = () => {
  viewingDish.value = {
      id: null, 
      name: '',
      dish_type_id: uiStore.dishes.activeCategory !== 'all' ? uiStore.dishes.activeCategory : dictionaries.dishTypes[0]?.id, 
      meal_type_id: uiStore.dishes.activeTag || dictionaries.mealTypes[1]?.id, 
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
  if (uiStore.dishes.searchQuery) {
    const q = uiStore.dishes.searchQuery.toLowerCase()
    result = result.filter(d => d.name.toLowerCase().includes(q))
  }

  // 2. Прием пищи (Завтрак/Обед...)
  if (uiStore.dishes.activeTag) {
    result = result.filter(d => d.meal_type_id === uiStore.dishes.activeTag)
  }

  // 3. Категория (Суп/Второе...)
  if (uiStore.dishes.activeCategory !== 'all') {
    result = result.filter(d => d.dish_type_id === uiStore.dishes.activeCategory)
  }

  // 4. ТЕГИ (Множественный выбор, логика AND)
  if (uiStore.dishes.filterTags.length > 0) {
      result = result.filter(dish => {
          const dishTagIds = dish.tags.map(t => t.id)
          return uiStore.dishes.filterTags.every(tagId => dishTagIds.includes(tagId))
      })
  }
  
  return result
})

const setCategory = (id) => {
    if(uiStore.dishes.activeCategory !== id) {
        telegram.haptic.selection()
        uiStore.dishes.activeCategory = id
    }
}

const setMealType = (id) => {
    if(uiStore.dishes.activeTag !== id) {
        telegram.haptic.selection()
        uiStore.dishes.activeTag = id
    }
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-12 pb-4">

      
      <div class="flex gap-2 mb-4">
          <div class="relative flex-1">
            <span class="material-icons-round absolute left-3.5 top-3.5 text-slate-400">search</span>
            <input 
              v-model="uiStore.dishes.searchQuery" 
              type="text" 
              placeholder="Название..." 
              class="w-full pl-10 p-3.5 bg-white rounded-2xl font-bold text-slate-800 outline-none shadow-sm focus:ring-2 ring-slate-900/10 transition-all border border-slate-100"
            >
          </div>
          
          <button 
            @click="openFilters"
            class="w-14 h-full bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center relative tap-effect"
          >
             <span class="material-icons-round text-slate-700">tune</span>
             <div v-if="uiStore.dishes.filterTags.length > 0" class="absolute top-3 right-3 w-2.5 h-2.5 bg-indigo-500 rounded-full border border-white"></div>
          </button>
      </div>
      
      <div class="flex overflow-x-auto gap-2 no-scrollbar pb-3 mb-1">
        <button 
          @click="setMealType(null)" 
          class="whitespace-nowrap px-5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all tap-effect border" 
          :class="uiStore.dishes.activeTag === null ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-400 border-slate-200'"
        >
          Все
        </button>

        <button 
          v-for="type in mealTypes" 
          :key="type.id" 
          @click="setMealType(type.id)" 
          class="whitespace-nowrap px-5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all tap-effect border" 
          :class="uiStore.dishes.activeTag === type.id ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-500 border-slate-200'"
        >
            {{ type.name }}
        </button>
      </div>

      <div class="flex overflow-x-auto gap-2 no-scrollbar pb-2">
        <button 
          @click="setCategory('all')" 
          class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-all tap-effect border" 
          :class="uiStore.dishes.activeCategory === 'all' ? 'bg-white text-slate-900 border-slate-300' : 'bg-slate-50 text-slate-400 border-slate-100'"
        >
            Все типы
        </button>

        <button 
          v-for="cat in dishCategories" 
          :key="cat.id" 
          @click="setCategory(cat.id)" 
          class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-all tap-effect border" 
          :class="uiStore.dishes.activeCategory === cat.id ? 'bg-white text-slate-900 border-slate-300 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100'"
        >
            {{ cat.name }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pt-4 pb-[76px] space-y-3 scroll-area">
      
      <div v-if="filteredDishes.length === 0" class="text-center py-20 opacity-40">
        <div class="text-5xl mb-2">🍳</div>
        <p class="font-bold text-slate-400">Ничего не найдено</p>
        <p v-if="uiStore.dishes.filterTags.length > 0" class="text-xs text-slate-300 mt-1">Попробуйте сбросить теги</p>
      </div>

      <div 
        v-for="dish in filteredDishes" 
        :key="dish.id" 
        @click="openDish(dish)" 
        class="bg-white p-4 rounded-[24px] shadow-sm flex flex-col gap-2 tap-effect border border-slate-100/50 relative group"
      >
        <div class="flex justify-between items-start">
          <span class="font-bold text-lg text-slate-900 leading-tight pr-8">{{ dish.name }}</span>
          <span class="text-[9px] font-bold bg-slate-50 text-slate-400 px-2 py-1 rounded-lg uppercase tracking-wider shrink-0 border border-slate-100">
              {{ dish.dish_type_name }}
          </span>
        </div>
        
        <div class="flex flex-wrap gap-1 mt-1">
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-md border text-indigo-600 bg-indigo-50 border-indigo-100">
               {{ dish.meal_type_name }}
            </span>
            <span 
                v-for="tag in dish.tags.slice(0, 3)" 
                :key="tag.id" 
                class="text-[9px] font-bold px-2 py-0.5 rounded-md border text-slate-500 bg-slate-50 border-slate-100 flex items-center gap-1" 
            >
               {{ tag.icon }} {{ tag.name }}
            </span>
            <span v-if="dish.tags.length > 3" class="text-[9px] font-bold text-slate-300 px-1 pt-0.5">+{{ dish.tags.length - 3 }}</span>
        </div>
        
        <div class="flex gap-3 text-[10px] font-bold text-slate-400 mt-1">
           <span class="text-orange-500">🔥 {{ dish.kcal || 0 }}</span>
           <span>Б {{ dish.protein || 0 }}</span>
           <span>Ж {{ dish.fat || 0 }}</span>
           <span>У {{ dish.carbs || 0 }}</span>
        </div>
      </div>
    </div>

    <div class="fixed bottom-24 right-5 z-[60]">
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
