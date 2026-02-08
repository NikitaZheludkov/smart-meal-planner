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

  // --- ЛОГИ ---
  const logs = ref([])
  const isLogOpen = ref(false)
  
  const addLog = (message, type = 'info', data = null) => {
    const logEntry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      type,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    }
    logs.value.unshift(logEntry)
    console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](`[${type.toUpperCase()}] ${message}`, data || '')
    if (logs.value.length > 100) logs.value.pop()
  }

  return { plan, dishes, shopping, logs, isLogOpen, addLog }
})