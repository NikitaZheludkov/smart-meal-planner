<script setup>
import { useUIStore } from '../stores/ui'
import { ref } from 'vue'

const ui = useUIStore()
const expandedLog = ref(null)

const toggleLog = (id) => {
  expandedLog.value = expandedLog.value === id ? null : id
}

const copyLogs = () => {
  const text = ui.logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`).join('\n')
  navigator.clipboard.writeText(text)
  ui.showToast('Логи скопированы', 'success')
}
</script>

<template>
  <transition name="slide-up">
    <div v-if="ui.isLogOpen" class="fixed inset-0 z-[100] bg-white flex flex-col">
      <header class="p-4 border-b flex items-center justify-between bg-slate-50">
        <h2 class="font-bold flex items-center gap-2">
          <span class="material-icons-outlined text-slate-400">bug_report</span>
          Логи приложения
        </h2>
        <div class="flex gap-2">
          <button @click="copyLogs" class="p-2 text-slate-500 active:scale-95">
            <span class="material-icons-round">content_copy</span>
          </button>
          <button @click="ui.isLogOpen = false" class="p-2 text-slate-500 active:scale-95">
            <span class="material-icons-round">close</span>
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[10px]">
        <div v-if="ui.logs.length === 0" class="p-8 text-center text-slate-400 italic">
          Логов пока нет...
        </div>
        <div 
          v-for="log in ui.logs" 
          :key="log.id" 
          class="p-2 rounded border border-slate-100 transition-colors"
          :class="{
            'bg-red-50 border-red-100': log.type === 'error',
            'bg-amber-50 border-amber-100': log.type === 'warn',
            'bg-blue-50 border-blue-100': log.type === 'info'
          }"
          @click="toggleLog(log.id)"
        >
          <div class="flex gap-2">
            <span class="text-slate-400 shrink-0">{{ log.time }}</span>
            <span class="font-bold break-all">{{ log.message }}</span>
          </div>
          
          <div v-if="expandedLog === log.id && log.data" class="mt-2 p-2 bg-white/50 rounded border border-slate-200 overflow-x-auto">
            <pre class="whitespace-pre-wrap">{{ JSON.stringify(log.data, null, 2) }}</pre>
          </div>
        </div>
      </div>
      
      <footer class="p-4 border-t bg-slate-50 flex gap-2">
        <button 
          @click="ui.logs = []" 
          class="flex-1 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
        >
          Очистить
        </button>
        <button 
          @click="ui.isLogOpen = false" 
          class="flex-1 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs"
        >
          Закрыть
        </button>
      </footer>
    </div>
  </transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s ease-out;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}
</style>
