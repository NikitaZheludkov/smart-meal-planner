<template>
  <div
    v-if="debugStore.isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="close"
  >
    <div class="bg-white rounded-lg shadow-xl w-11/12 max-w-2xl flex flex-col" style="height: 80vh;">
      <header class="flex items-center justify-between p-4 border-b">
        <h2 class="text-lg font-bold">Логи ошибок</h2>
        <button @click="close" class="text-gray-500 hover:text-gray-800">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <main class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="debugStore.logs.length === 0" class="text-center text-gray-500">
          Ошибок нет.
        </div>
        <div v-for="(log, index) in debugStore.logs" :key="index" class="bg-gray-100 p-3 rounded">
          <p class="font-semibold text-sm text-gray-700">{{ log.timestamp }}</p>
          <p class="text-red-600 font-bold">{{ log.error }}</p>
          <p class="text-xs text-gray-600 mt-1">{{ log.info }}</p>
          <pre class="text-xs text-gray-500 mt-2 whitespace-pre-wrap break-words">{{ log.stack }}</pre>
        </div>
      </main>

      <footer class="flex justify-end p-4 border-t space-x-2">
        <button @click="copyLogs" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          Копировать
        </button>
        <button @click="clearLogs" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
          Очистить
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { useDebugStore } from '@/stores/debug'
import { computed } from 'vue'

const debugStore = useDebugStore()

function close() {
  debugStore.hide()
}

function clearLogs() {
  debugStore.clearLogs()
}

function copyLogs() {
  const logsText = debugStore.logs
    .map(log => {
      return `[${log.timestamp}]\nError: ${log.error}\nInfo: ${log.info}\nStack: ${log.stack}`
    })
    .join('\n\n')
  navigator.clipboard.writeText(logsText).then(() => {
    alert('Логи скопированы в буфер обмена!')
  }).catch(err => {
    console.error('Не удалось скопировать логи:', err)
    alert('Не удалось скопировать логи. Пожалуйста, скопируйте вручную из консоли.')
  })
}
</script>
