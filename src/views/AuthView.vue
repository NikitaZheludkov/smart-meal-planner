<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTelegramStore } from '../stores/telegram'

const auth = useAuthStore()
const telegram = useTelegramStore()

const email = ref('')
const password = ref('')
const isLogin = ref(true)
const transitionName = ref('slide-left')

watch(isLogin, (newVal) => {
  transitionName.value = newVal ? 'slide-right' : 'slide-left'
})

const handleSubmit = async () => {
    try {
        if (isLogin.value) {
            await auth.signIn(email.value, password.value)
        } else {
            await auth.signUp(email.value, password.value)
        }
    } catch (e) {
        // Ошибка уже обработана в сторе
    }
}
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
      <p class="text-slate-400 text-sm font-bold mb-8">
        {{ telegram.initData ? 'Загрузка профиля...' : 'Добро пожаловать!' }}
      </p>

      <!-- Состояние загрузки TG (только если мы в TMA) -->
      <div v-if="telegram.initData && (auth.loading || auth.authStatus === 'loading')" class="flex flex-col items-center gap-3">
        <span class="material-icons-outlined animate-spin text-3xl text-indigo-500">donut_large</span>
        <p class="text-[10px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">Синхронизация с Telegram</p>
      </div>

      <!-- Ошибка входа (TG или Web) -->
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
            @click="auth.authError?.type === 'network' ? auth.init() : (auth.authStatus = 'idle')" 
            class="w-full py-3 bg-slate-900 text-white rounded-xl shadow-lg active:scale-95 transition-transform font-bold text-sm"
        >
            {{ auth.authError?.type === 'network' ? 'Попробовать снова' : 'Вернуться назад' }}
        </button>
      </div>

      <!-- Форма входа (Web) -->
      <div v-else-if="!telegram.initData" class="w-full space-y-4 relative overflow-hidden">
        <div class="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4">
            <div class="flex bg-slate-100 p-1 rounded-xl mb-2">
                <button 
                    @click="isLogin = true" 
                    class="flex-1 py-2 text-xs font-bold rounded-lg transition-colors"
                    :class="isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                >Вход</button>
                <button 
                    @click="isLogin = false" 
                    class="flex-1 py-2 text-xs font-bold rounded-lg transition-colors"
                    :class="!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                >Регистрация</button>
            </div>

            <div class="relative overflow-hidden min-h-[280px]">
              <transition :name="transitionName">
                <div v-if="isLogin" key="login" class="absolute inset-0 w-full h-full">
                  <div class="space-y-3 text-left">
                    <div>
                      <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Email</label>
                      <input 
                        v-model="email"
                        type="email" 
                        placeholder="your@email.com"
                        class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                      >
                    </div>
                    <div>
                      <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Пароль</label>
                      <input 
                        v-model="password"
                        type="password" 
                        placeholder="••••••••"
                        class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                      >
                    </div>
                  </div>
                </div>

                <div v-else key="register" class="absolute inset-0 w-full h-full">
                  <div class="space-y-3 text-left">
                    <div>
                      <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Email</label>
                      <input 
                        v-model="email"
                        type="email" 
                        placeholder="your@email.com"
                        class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                      >
                    </div>
                    <div>
                      <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Пароль</label>
                      <input 
                        v-model="password"
                        type="password" 
                        placeholder="••••••••"
                        class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                      >
                    </div>
                  </div>
                </div>
              </transition>
            </div>

            <button 
                @click="handleSubmit"
                :disabled="auth.loading"
                class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
                <span v-if="auth.loading" class="material-icons-round animate-spin text-lg">donut_large</span>
                <span>{{ isLogin ? 'Войти' : 'Создать аккаунт' }}</span>
            </button>
        </div>
        
        <button 
          @click="auth.loginAsTestUser()" 
          class="w-full py-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
        >
          Войти как Dev User
        </button>
      </div>

    </div>
    
    <div class="p-6 text-center z-10">
        <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
            {{ telegram.initData ? 'Secure Telegram Auth' : 'Meal Planner Cloud' }} • v1.1
        </p>
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