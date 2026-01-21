import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  
  // --- ПЛАН ---
  const plan = ref({
    activeTab: 'day', // Всегда сбрасываем на "День"
    selectedDate: new Date(), // Всегда сегодня
    currentWeekStart: new Date() // Текущая неделя
  })

  // --- БЛЮДА ---
  const dishes = ref({
    activeCategory: 'Все',
    activeTag: null,
    searchQuery: ''
  })

  // --- ПОКУПКИ ---
  const shopping = ref({
    activeTab: 'list',
    filterMode: 'category' 
  })

  // МЫ УБРАЛИ watch() и чтение из localStorage. 
  // Теперь состояние живет только пока открыта вкладка.

  return { plan, dishes, shopping }
})