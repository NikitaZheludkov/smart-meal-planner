<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const devInput = ref('')

// Инициализация виджета Telegram
onMounted(() => {
  // Коллбек от виджета
  window.onTelegramAuth = (user) => auth.loginWithUser(user)

  // Вставка скрипта (только если его еще нет)
  const botName = 'MyMealPlannerBot' // <--- ТВОЙ БОТ
  
  if (!document.getElementById('tg-widget-script')) {
    const script = document.createElement('script')
    script.id = 'tg-widget-script'
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    document.getElementById('telegram-login-container')?.appendChild(script)
  }
})
</script>

<template>
  <div class="h-full flex flex-col relative bg-white">
    
    <div class="flex-1 flex flex-col items-center justify-center p-8 text-center">
      
      <div class="w-24 h-24 bg-slate-50 rounded-[32px] flex items-center justify-center mb-8 shadow-xl shadow-slate-100 animate-float border border-slate-100">
        <span class="text-6xl">🥗</span>
      </div>

      <h1 class="text-3xl font-black text-slate-900 mb-3 tracking-tight">Meal Planner</h1>
      <p class="text-slate-500 font-medium mb-12 max-w-[200px] leading-relaxed">
        Планируйте рацион, составляйте списки покупок и делитесь с семьей.
      </p>

      <div class="w-full min-h-[50px] flex justify-center items-center mb-6">
        <div id="telegram-login-container"></div>
      </div>
      
      <div v-if="!auth.isDev" class="text-[10px] text-slate-300">
        Если кнопки нет, откройте приложение через Telegram
      </div>

    </div>

    <div v-if="auth.isDev" class="bg-slate-900 text-white p-4 rounded-t-3xl shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400">Dev Mode</span>
        </div>
        <span class="text-[10px] text-slate-500">Localhost Tools</span>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-2">
        <button 
          @click="auth.devLogin(777)" 
          class="bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-xs font-bold transition-colors"
        >
          Войти как ADMIN
        </button>
        <button 
          @click="auth.devLogin(101)" 
          class="bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-xs font-bold transition-colors"
        >
          Войти как GUEST
        </button>
      </div>

      <div class="flex gap-2">
        <input 
          v-model="devInput" 
          type="number" 
          placeholder="Любой ID" 
          class="bg-slate-800 text-white text-xs p-2 rounded-lg outline-none w-20 text-center font-mono"
        >
        <button 
          @click="auth.devLogin(Number(devInput))" 
          class="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-xs font-bold text-slate-300"
        >
          Войти по ID
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-float { animation: float 6s ease-in-out infinite; }
@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}
</style>