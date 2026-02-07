import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDebugStore = defineStore('debug', () => {
  const logs = ref([])
  const isVisible = ref(false)

  function addLog(error, info) {
    const timestamp = new Date().toISOString()
    logs.value.push({
      timestamp,
      error: error.toString(),
      stack: error.stack,
      info
    })
  }

  function clearLogs() {
    logs.value = []
  }

  function show() {
    isVisible.value = true
  }

  function hide() {
    isVisible.value = false
  }

  return {
    logs,
    isVisible,
    addLog,
    clearLogs,
    show,
    hide
  }
})
