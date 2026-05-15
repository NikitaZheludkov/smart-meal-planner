<script setup>
import { ref } from 'vue'
import { useTelegramStore } from '../stores/telegram'
import DishesView from './DishesView.vue'
import ProductsView from './ProductsView.vue'

const telegram = useTelegramStore()
const activeMode = ref('dishes')
const searchQuery = ref('')
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
      
      <div class="flex gap-2">
        <div class="flex-1 bg-slate-100 p-1 rounded-xl flex font-bold text-[10px]">
          <button 
            @click="activeMode = 'dishes'; telegram.haptic.selection()" 
            class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
            :class="activeMode === 'dishes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
          >
            <span>🥘</span> Рецепты
          </button>
          <button 
            @click="activeMode = 'products'; telegram.haptic.selection()" 
            class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
            :class="activeMode === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
          >
            <span>🥦</span> Продукты
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <DishesView v-if="activeMode === 'dishes'" :search-query="searchQuery" />
      <ProductsView v-else :search-query="searchQuery" />
    </div>
  </div>
</template>
