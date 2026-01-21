<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const errorMsg = ref('')

const handleDevLogin = async () => {
  errorMsg.value = ''
  try {
    await auth.loginAsTestUser()
  } catch (e) {
    errorMsg.value = 'Ошибка входа: ' + e.message
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <div class="flex-1 flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto text-center">
      
      <div class="w-24 h-24 bg-indigo-50 rounded-[32px] flex items-center justify-center mb-6 border border-indigo-100 shadow-sm animate-bounce-slow">
        <span class="text-5xl">🥗</span>
      </div>

      <h1 class="text-3xl font-black text-slate-900 mb-3 tracking-tight">Meal Planner</h1>
      <p class="text-slate-400 text-sm font-bold mb-12 max-w-[200px] leading-relaxed">
        Умное планирование меню для всей семьи
      </p>

      <div class="w-full space-y-4">
        <button 
          @click="handleDevLogin" 
          :disabled="auth.loading"
          class="w-full py-4 bg-[#2AABEE] text-white rounded-2xl font-bold text-sm shadow-xl shadow-blue-400/30 tap-effect flex items-center justify-center gap-3 transition-all hover:bg-[#229ED9]"
        >
          <span v-if="auth.loading" class="material-icons-round animate-spin text-lg">sync</span>
          <span v-else class="material-icons-round text-lg">telegram</span>
          <span>{{ auth.loading ? 'Загрузка...' : 'Запустить (Dev Mode)' }}</span>
        </button>

        <p class="text-[10px] text-slate-300 font-bold px-4">
          Режим тестирования: вход выполняется автоматически под dev-аккаунтом.
        </p>
      </div>

      <div v-if="errorMsg" class="mt-4 bg-red-50 text-red-500 text-xs font-bold p-3 rounded-xl">
          {{ errorMsg }}
      </div>
    </div>
    
    <div class="p-6 text-center">
        <p class="text-[10px] text-slate-300 font-bold">v0.3.0 • Telegram Mini App Ready</p>
    </div>
  </div>
</template>

<style scoped>
.animate-bounce-slow {
  animation: bounce 3s infinite;
}
@keyframes bounce {
  0%, 100% { transform: translateY(-5%); }
  50% { transform: translateY(5%); }
}
</style>