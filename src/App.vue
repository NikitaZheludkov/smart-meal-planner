<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useDictionariesStore } from './stores/dictionaries'
import { useSettingsStore } from './stores/settings'
import { useTelegramStore } from './stores/telegram'
import { useRealtimeStore } from './stores/realtime' // <-- Импортируем Realtime

// Импортируем компоненты страниц
import PlanView from './views/PlanView.vue'
import DishesView from './views/DishesView.vue'
import ProductsView from './views/ProductsView.vue'
import ShoppingView from './views/ShoppingView.vue'
import SettingsView from './views/SettingsView.vue'
import AuthView from './views/AuthView.vue' 

const auth = useAuthStore()
const dictionaries = useDictionariesStore()
const settings = useSettingsStore()
const telegram = useTelegramStore()
const realtime = useRealtimeStore() // <-- Инициализируем стор

const currentTab = ref('plan')
const error = ref(null)

// Глобальный флаг загрузки
const isAppInitializing = ref(true)
const initError = ref(null)

const tabs = [
  { id: 'plan', label: 'План', icon: 'calendar_today', component: PlanView },
  { id: 'dishes', label: 'Блюда', icon: 'restaurant_menu', component: DishesView },
  { id: 'shopping', label: 'Купить', icon: 'shopping_bag', component: ShoppingView },
  { id: 'products', label: 'Продукты', icon: 'kitchen', component: ProductsView },
  { id: 'settings', label: 'Настр.', icon: 'tune', component: SettingsView }
]

const activeComponent = computed(() => {
  const tab = tabs.find(t => t.id === currentTab.value)
  return tab ? tab.component : PlanView
})

// Логика переключения вкладок с вибрацией
const switchTab = (tabId) => {
    if (currentTab.value === tabId) return
    telegram.haptic.impact('light') 
    currentTab.value = tabId
}

// Единая функция загрузки данных пользователя
const loadUserData = async () => {
    isAppInitializing.value = true 
    initError.value = null
    
    try {
        if (auth.isAuth) {
            // Загружаем настройки и справочники параллельно
            await Promise.all([
                settings.fetchSettings(),
                dictionaries.fetchDictionaries()
            ])
            
            // <-- ЗАПУСКАЕМ REALTIME СИНХРОНИЗАЦИЮ
            // Это позволит получать обновления от других членов семьи
            realtime.init()
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e)
        error.value = e
    } finally {
        isAppInitializing.value = false
    }
}

// Если статус авторизации меняется (например, вошли), грузим данные
watch(() => auth.isAuth, (newVal) => {
  if (newVal) loadUserData()
})

// Обработчик возвращения приложения из фона/сна
 const handleAppResume = async () => {
     if (document.visibilityState === 'visible') {
         console.log('📱 [App] Видимость восстановлена, запуск проверки...')
         
         // 1. Обновляем сессию Supabase
         await auth.refreshSession()
         
         // 2. Если авторизованы, переподключаем Realtime
         if (auth.isAuth) {
             console.log('📱 [App] Авторизован, обновляем данные...')
             realtime.reconnect()
             // Принудительно обновляем справочники, если они пустые
             if (dictionaries.productCategories.length === 0) {
                 dictionaries.fetchDictionaries()
             }
         } else {
             console.warn('📱 [App] После пробуждения сессия не восстановлена')
         }
     } else {
         console.log('📱 [App] Приложение ушло в фон')
     }
 }

onMounted(async () => {
    // Слушаем события видимости и сети
    document.addEventListener('visibilitychange', handleAppResume)
    window.addEventListener('online', handleAppResume)
    window.addEventListener('offline', () => {
        console.log('🌐 Соединение потеряно');
    })

    // Фолбэк на случай зависания инициализации на мобильных TMA
    const timer = setTimeout(() => {
        if (isAppInitializing.value) {
            isAppInitializing.value = false
        }
    }, 8000)
    try {
        telegram.init() 
        await auth.init() 
        
        if (auth.isAuth) {
            await loadUserData() 
        } else {
            // Если не авторизованы, просто убираем загрузчик (покажем AuthView)
            isAppInitializing.value = false 
        }
    } catch (e) {
        console.error('Критическая ошибка старта:', e)
        error.value = e
        isAppInitializing.value = false
    }
    clearTimeout(timer)
})

onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleAppResume)
    window.removeEventListener('online', handleAppResume)
})
</script>

<template>
  <div class="flex flex-col h-[100dvh] max-w-md mx-auto bg-slate-50 relative overflow-hidden text-slate-900 font-sans selection:bg-amber-100">
    
    <div v-if="isAppInitializing" class="flex-1 flex flex-col items-center justify-center gap-4 bg-white z-[100]">
      <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl animate-bounce">🥗</div>
      <span class="material-icons-round animate-spin text-3xl text-slate-300">sync</span>
      <p class="text-xs font-bold text-slate-300 uppercase tracking-widest">Синхронизация...</p>
    </div>

    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center p-4 text-center bg-red-50 text-red-800">
        <span class="material-icons-round text-4xl text-red-400 mb-2">error_outline</span>
        <p class="text-sm font-bold">Произошла ошибка</p>
        <div class="mt-4 p-2 bg-white rounded-lg text-left text-xs w-full overflow-auto" style="max-height: 50vh;">
          <pre>{{ error.stack || error }}</pre>
        </div>
        <button @click="window.location.reload()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold">Обновить</button>
    </div>

    <div v-else-if="!auth.isAuth" class="flex-1 bg-white">
      <AuthView />
    </div>

    <template v-else>
      <main class="flex-1 overflow-y-auto no-scrollbar relative z-0 pb-[76px] pb-safe" :class="telegram.isReady ? 'pt-tg-safe' : ''">
        <transition name="fade" mode="out-in">
           <component :is="activeComponent" />
        </transition>
      </main>

      <nav class="pb-safe bg-white/95 backdrop-blur-xl border-t border-slate-100/50 z-50 absolute bottom-0 w-full rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] transition-transform duration-300"
           :class="{ 'translate-y-full': telegram.isKeyboardOpen }">
        <div class="h-[76px] grid grid-cols-5 items-center">
          <button 
            v-for="tab in tabs" 
            :key="tab.id" 
            @click="switchTab(tab.id)" 
            class="flex flex-col items-center justify-center transition-colors duration-200 pb-2 active:scale-95 transition-transform" 
            :class="currentTab === tab.id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'"
          >
            <span class="material-icons-round text-[26px] mb-1 transition-transform duration-200" :class="currentTab === tab.id ? '-translate-y-1' : ''">{{ tab.icon }}</span>
            <span class="text-[9px] font-bold tracking-wide" v-if="currentTab === tab.id">{{ tab.label }}</span>
          </button>
        </div>
      </nav>
    </template>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
