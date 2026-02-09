<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTelegramStore } from '../stores/telegram'

const auth = useAuthStore()
const telegram = useTelegramStore()

// При открытии страницы пытаемся сразу войти
onMounted(() => {
    // Если init() в App.vue еще не сработал или не вошел, 
    // authStore.init() сам вызовет loginWithTelegram
})
</script>

<template>
  <div class="h-full flex flex-col bg-white relative overflow-hidden">
    
    <div class="absolute -top-20 -right-20 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-0 -left-10 w-72 h-72 bg-blue-50 rounded-full blur-3xl opacity-60"></div>

    <div class="flex-1 flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto text-center z-10">
      
      <div class="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center mb-6 border border-slate-100 shadow-xl shadow-indigo-100/50 relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-50 to-white"></div>
        <span class="text-5xl relative z-10 animate-bounce-slow">🥗</span>
      </div>

      <h1 class="text-3xl font-black text-slate-900 mb-2 tracking-tight">Meal Planner</h1>
      <p class="text-slate-400 text-sm font-bold mb-8">Загрузка вашего профиля...</p>

      <div v-if="auth.loading || auth.authStatus === 'loading'" class="flex flex-col items-center gap-3">
        <span class="material-icons-round animate-spin text-3xl text-indigo-500">donut_large</span>
        <p class="text-[10px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">Синхронизация с Telegram</p>
      </div>

      <div v-else-if="auth.authStatus === 'error'" class="w-full animate-fade-in">
        <div class="bg-red-50 p-4 rounded-2xl border border-red-100 text-red-500 text-xs font-bold mb-4">
            <div class="flex items-center justify-center gap-2 mb-2">
                <span class="material-icons-round text-lg">
                    {{ auth.authError?.type === 'network' ? 'wifi_off' : 'error_outline' }}
                </span>
                <span>{{ auth.authError?.message || 'Ошибка входа' }}</span>
            </div>
            <p v-if="auth.authError?.type === 'network'" class="opacity-70 font-normal">
                Проверьте соединение и попробуйте снова.
            </p>
        </div>
        
        <button 
            v-if="auth.authError?.canRetry"
            @click="auth.loginWithTelegram()" 
            class="w-full py-3 bg-slate-900 text-white rounded-xl shadow-lg active:scale-95 transition-transform font-bold text-sm"
        >
            Попробовать снова
        </button>
        <button 
            v-else
            @click="auth.loginWithTelegram()" 
            class="px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-bold"
        >
            Перезагрузить
        </button>
      </div>

      <div v-else-if="!telegram.initData" class="w-full space-y-4 animate-fade-in">
        <div class="bg-orange-50 p-4 rounded-2xl border border-orange-100 text-orange-600 text-xs font-bold mb-4">
            Приложение запущено вне Telegram.<br>Авто-вход невозможен.
        </div>
        
        <button 
          @click="auth.loginAsTestUser()" 
          class="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl tap-effect"
        >
          Войти как Dev User
        </button>
      </div>

    </div>
    
    <div class="p-6 text-center z-10">
        <p class="text-[10px] text-slate-300 font-bold">Secure Telegram Auth • v1.0</p>
    </div>
  </div>
</template>

<style scoped>
.animate-bounce-slow { animation: bounce 3s infinite; }
@keyframes bounce {
  0%, 100% { transform: translateY(-5%); }
  50% { transform: translateY(5%); }
}
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>