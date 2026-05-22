<script setup>
import { ref, computed, watch } from 'vue'
import { usePlatformStore } from '../stores/platform'
import { useDictionariesStore } from '../stores/dictionaries'
import { useProductStore } from '../stores/products'
import { useUIStore } from '../stores/ui'
import DishesView from './DishesView.vue'
import ProductsView from './ProductsView.vue'

const platform = usePlatformStore()
const dictionaries = useDictionariesStore()
const productStore = useProductStore()
const uiStore = useUIStore()

const activeMode = ref('dishes')
const transitionName = ref('slide-left')
const searchQuery = ref('')

const modes = ['dishes', 'products']

watch(activeMode, (newVal, oldVal) => {
  const oldIndex = modes.indexOf(oldVal)
  const newIndex = modes.indexOf(newVal)
  transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right'
})

// Категории для продуктов (вычисляемые из существующих продуктов)
const productCategories = computed(() => {
  const cats = new Set(productStore.products.map(p => p.category || 'Разное'))
  return ['Все', ...Array.from(cats).sort()]
})

// Установка категории для блюд
const setDishCategory = (id) => {
  if (uiStore.dishes.activeCategory !== id) {
    platform.haptic.selection()
    uiStore.dishes.activeCategory = id
  }
}

// Установка категории для продуктов
const setProductCategory = (cat) => {
  if (uiStore.products.activeCategory !== cat) {
    platform.haptic.selection()
    uiStore.products.activeCategory = cat
  }
}

// Установка приема пищи
const setMealType = (id) => {
  if (uiStore.dishes.activeTag !== id) {
    platform.haptic.selection()
    uiStore.dishes.activeTag = id
  }
}
</script>

<template>
  <div class="h-full bg-slate-50 flex flex-col relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4">
      
      <div class="relative mb-3">
        <span class="material-icons-outlined absolute left-3.5 top-3 text-slate-400">search</span>
        <input 
          v-model="searchQuery" 
          type="text" 
          :placeholder="activeMode === 'dishes' ? 'Поиск по названию...' : 'Поиск по базе...'" 
          class="w-full pl-10 pr-10 py-2.5 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 ring-slate-900/10 transition-colors border border-slate-100"
        >
        <button 
          v-if="searchQuery" 
          @click="searchQuery = ''"
          class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 tap-effect"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </div>
      
      <div class="flex gap-2 mb-3">
        <div class="flex-1 bg-slate-100 p-1 rounded-xl flex font-bold text-[10px]">
          <button 
            @click="activeMode = 'dishes'; platform.haptic.selection()" 
            class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
            :class="activeMode === 'dishes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
          >
            <span>🥘</span> Рецепты
          </button>
          <button 
            @click="activeMode = 'products'; platform.haptic.selection()" 
            class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
            :class="activeMode === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
          >
            <span>🥦</span> Продукты
          </button>
        </div>
      </div>

      <!-- Блок категорий (основные) -->
      <div class="flex overflow-x-auto gap-2 no-scrollbar mb-2">
        <!-- Категории для рецептов -->
        <template v-if="activeMode === 'dishes'">
          <button 
            @click="setDishCategory('all')" 
            class="whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors tap-effect border" 
            :class="uiStore.dishes.activeCategory === 'all' ? 'bg-white text-slate-900 border-slate-300 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100'"
          >
            Все типы
          </button>
          <button 
            v-for="cat in dictionaries.dishTypes" 
            :key="cat.id" 
            @click="setDishCategory(cat.id)" 
            class="whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors tap-effect border" 
            :class="uiStore.dishes.activeCategory === cat.id ? 'bg-white text-slate-900 border-slate-300 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100'"
          >
            {{ cat.name }}
          </button>
        </template>

        <!-- Категории для продуктов -->
        <template v-else>
          <button 
            v-for="cat in productCategories" 
            :key="cat"
            @click="setProductCategory(cat)"
            class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-colors border"
            :class="uiStore.products.activeCategory === cat ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200'"
          >
            {{ cat }}
          </button>
        </template>
      </div>

      <!-- Блок приемов пищи (только для рецептов) -->
      <div v-if="activeMode === 'dishes'" class="flex overflow-x-auto gap-2 no-scrollbar">
        <button 
          @click="setMealType(null)" 
          class="whitespace-nowrap px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors tap-effect border" 
          :class="uiStore.dishes.activeTag === null ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-400 border-slate-200'"
        >
          Все
        </button>
        <button 
          v-for="type in dictionaries.mealTypes" 
          :key="type.id" 
          @click="setMealType(type.id)" 
          class="whitespace-nowrap px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors tap-effect border" 
          :class="uiStore.dishes.activeTag === type.id ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200'"
        >
          {{ type.name }}
        </button>
      </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
      <transition :name="transitionName">
        <DishesView v-if="activeMode === 'dishes'" :key="'dishes'" :search-query="searchQuery" class="absolute inset-0 w-full h-full overflow-y-auto" />
        <ProductsView v-else :key="'products'" :search-query="searchQuery" class="absolute inset-0 w-full h-full overflow-y-auto" />
      </transition>
    </div>
  </div>
</template>
