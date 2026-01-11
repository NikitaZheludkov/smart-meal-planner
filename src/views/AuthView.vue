<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const widgetLoaded = ref(false) // Флаг загрузки

onMounted(() => {
  window.onTelegramAuth = (user) => auth.loginWithUser(user)

  // Имя бота (УБЕДИСЬ ЧТО ОНО ВЕРНОЕ!)
  const botName = 'SmartMeal2025_Bot' // <--- ПРОВЕРЬ ЭТО
  
  if (!document.getElementById('tg-widget-script')) {
    const script = document.createElement('script')
    script.id = 'tg-widget-script'
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', SmartMeal2025_Bot)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    
    // Слушаем загрузку скрипта
    script.onload = () => { widgetLoaded.value = true }
    
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

      <div class="w-full min-h-[50px] flex justify-center items-center mb-6 relative">
        <div id="telegram-login-container"></div>
        
        <div v-if="!widgetLoaded && !auth.isDev" class="absolute inset-0 flex items-center justify-center">
           <p class="text-[10px] text-red-400 font-bold bg-red-50 p-2 rounded-lg">
             Виджет Telegram не загрузился.<br>Попробуйте отключить AdBlock.
           </p>
        </div>
      </div>
      
      <div class="text-[10px] text-slate-300">
        Если вы видите это сообщение на ПК — используйте вход ниже.
      </div>

      <div class="mt-8 w-full max-w-xs">
          <button 
            @click="auth.loginAsAdmin()" 
            class="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl font-bold transition-all tap-effect flex items-center justify-center gap-3 border border-slate-200"
          >
            <span class="material-icons-round text-slate-400">admin_panel_settings</span>
            <span>Войти как Администратор</span>
          </button>
       </div>

    </div>

    <div v-if="auth.isDev" class="bg-slate-900 text-white p-4 rounded-t-3xl shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400">Dev Mode</span>
        </div>
      </div>
      <button @click="auth.devLogin(777)" class="bg-indigo-600 w-full py-2 rounded-lg text-xs font-bold">Login ADMIN</button>
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