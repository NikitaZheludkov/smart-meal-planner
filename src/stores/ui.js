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
  const toasts = ref([]) // Очередь уведомлений
  const isLogOpen = ref(false)
  const isOffline = ref(!navigator.onLine)
  
  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now()
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }

  const setOffline = (value) => {
    isOffline.value = value
    if (value) {
        addLog('Сетевое соединение потеряно', 'warn')
        showToast('Нет интернета', 'error')
    } else {
        addLog('Сетевое соединение восстановлено', 'info')
        showToast('Связь восстановлена', 'success')
    }
  }

  const addLog = (message, type = 'info', data = null) => {
    // Авто-добавление версии при первом логировании
    if (logs.value.length === 0) {
      logs.value.push({
        id: 'version',
        time: new Date().toLocaleTimeString(),
        type: 'info',
        message: 'App Version: 1.0.5 (Logging Update)',
        data: { build: new Date().toISOString() }
      })
    }
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

  return { plan, dishes, shopping, logs, toasts, isLogOpen, isOffline, setOffline, addLog, showToast }
})