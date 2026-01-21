<script setup>
import { ref, onMounted, computed } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import DishDetailModal from '../components/DishDetailModal.vue'

const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const uiStore = useUIStore()

// Используем новые списки из словаря
const filterCategories = computed(() => {
  return ['Все', ...dictionaries.dishTypes]
})

const mealTypes = computed(() => dictionaries.mealTypes)

// --- МОДАЛКА ---
const showDetailModal = ref(false)
const viewingDish = ref(null)

const openDish = (dish) => {
  viewingDish.value = dish
  showDetailModal.value = true
}

const openCreateDish = () => {
  const defaultCat = uiStore.dishes.activeCategory !== 'Все' 
    ? uiStore.dishes.activeCategory 
    : (dictionaries.dishTypes[0] || '')
    
  viewingDish.value = {
      id: null, 
      name: '',
      dish_type: defaultCat, // Используем dish_type
      meal_type: dictionaries.mealTypes[1], // Обед по умолчанию
      kcal: null, protein: null, fat: null, carbs: null,
      tags: [],
      ingredients: []
  }
  showDetailModal.value = true
}

onMounted(async () => {
  if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
  if (productStore.products.length === 0) await productStore.fetchProducts()
  dictionaries.fetchDictionaries()
})

// Фильтрация
const filteredDishes = computed(() => {
  let result = dishStore.dishes
  
  // 1. Фильтр по Типу Блюда (вместо старых категорий)
  if (uiStore.dishes.activeCategory !== 'Все') {
    result = result.filter(d => d.dish_type === uiStore.dishes.activeCategory)
  }

  // 2. Фильтр по Приему Пищи (вместо тегов)
  if (uiStore.dishes.activeTag) {
     // activeTag у нас теперь хранит имя приема пищи (Завтрак, Обед...)
    result = result.filter(d => d.meal_type === uiStore.dishes.activeTag)
  }
  
  // 3. Поиск
  if (uiStore.dishes.searchQuery) {
    const q = uiStore.dishes.searchQuery.toLowerCase()
    result = result.filter(d => d.name.toLowerCase().includes(q))
  }
  
  return result
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    
    <div class="bg-slate-50 pt-12 pb-2 px-5 sticky top-0 z-20 shadow-sm border-b border-slate-100">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-4">Блюда</h1>
      
      <div class="relative mb-4">
        <span class="material-icons-round absolute left-4 top-3.5 text-slate-400">search</span>
        <input 
          v-model="uiStore.dishes.searchQuery" 
          type="text" 
          placeholder="Найти рецепт..." 
          class="w-full pl-11 p-3.5 bg-white rounded-2xl font-bold text-slate-800 outline-none shadow-sm focus:ring-2 ring-slate-900/10 transition-all"
        >
      </div>
      
      <div class="flex overflow-x-auto gap-2 no-scrollbar pb-3 mb-1">
        <button 
          @click="uiStore.dishes.activeTag = null" 
          class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all tap-effect border" 
          :class="uiStore.dishes.activeTag === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'"
        >
          Все
        </button>

        <button 
          v-for="type in mealTypes" 
          :key="type" 
          @click="uiStore.dishes.activeTag = type" 
          class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all tap-effect border" 
          :class="uiStore.dishes.activeTag === type ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-500 border-slate-200'"
        >
            {{ type }}
        </button>
      </div>

      <div class="flex overflow-x-auto gap-2 no-scrollbar pb-2">
        <button 
          v-for="cat in filterCategories" 
          :key="cat" 
          @click="uiStore.dishes.activeCategory = cat" 
          class="whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all tap-effect border" 
          :class="uiStore.dishes.activeCategory === cat ? 'bg-white text-slate-900 border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200'"
        >
            {{ cat }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-32 space-y-3 pt-4">
      
      <div v-if="filteredDishes.length === 0" class="text-center py-20 opacity-40">
        <div class="text-5xl mb-2">🍳</div>
        <p class="font-bold text-slate-400">Нет блюд</p>
        <p v-if="uiStore.dishes.activeTag || uiStore.dishes.activeCategory !== 'Все'" class="text-xs text-slate-300 mt-1">
            Попробуйте изменить фильтры
        </p>
      </div>

      <div 
        v-for="dish in filteredDishes" 
        :key="dish.id" 
        @click="openDish(dish)" 
        class="bg-white p-4 rounded-[24px] shadow-sm flex flex-col gap-2 tap-effect border border-slate-100/50 relative group"
      >
        <div class="flex justify-between items-start">
          <span class="font-bold text-lg text-slate-900 leading-tight pr-8">{{ dish.name }}</span>
          <span class="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-wider shrink-0">
              {{ dish.dish_type }}
          </span>
        </div>
        
        <div class="flex flex-wrap gap-1 mt-1">
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-md border text-indigo-600 bg-indigo-50 border-indigo-100">
               {{ dish.meal_type }}
            </span>
            <span 
                v-for="tag in dish.tags" 
                :key="tag.id" 
                class="text-[9px] font-bold px-2 py-0.5 rounded-md border text-slate-500 bg-slate-50 border-slate-100" 
            >
               #{{ tag.name }}
            </span>
        </div>
        
        <div class="flex gap-3 text-[10px] font-bold text-slate-400 mt-1">
           <span class="text-orange-500">🔥 {{ dish.kcal || 0 }}</span>
           <span>Б {{ dish.protein || 0 }}</span>
           <span>Ж {{ dish.fat || 0 }}</span>
           <span>У {{ dish.carbs || 0 }}</span>
        </div>
      </div>
    </div>

    <div class="fixed bottom-24 right-5 z-30">
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

  </div>
</template>