import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  
  // --- ПЛАН ---
  const plan = ref({
    activeTab: 'day',
    selectedDate: new Date(),
    currentWeekStart: new Date() 
  })

  // --- БЛЮДА ---
  const dishes = ref({
    activeCategory: 'all', // Тип блюда (Суп, Второе...)
    activeTag: null,       // Прием пищи (Завтрак, Обед...) - старое название переменной
    filterTags: [],        // НОВОЕ: Массив ID выбранных тегов (Быстро, ПП...)
    searchQuery: ''
  })

  // --- ПОКУПКИ ---
  const shopping = ref({
    activeTab: 'list',
    filterMode: 'category' 
  })

  return { plan, dishes, shopping }
})