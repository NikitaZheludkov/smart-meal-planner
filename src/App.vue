<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useDictionariesStore } from './stores/dictionaries'
import { useSettingsStore } from './stores/settings'
import { useTelegramStore } from './stores/telegram'
import { useRealtimeStore } from './stores/realtime'
import { useUIStore } from './stores/ui'

// Импортируем компоненты страниц
import PlanView from './views/PlanView.vue'
import DishesView from './views/DishesView.vue'
import ProductsView from './views/ProductsView.vue'
import ShoppingView from './views/ShoppingView.vue'
import SettingsView from './views/SettingsView.vue'
import AuthView from './views/AuthView.vue' 
import AppLogs from './components/AppLogs.vue'

const auth = useAuthStore()
const dictionaries = useDictionariesStore()
const settings = useSettingsStore()
const telegram = useTelegramStore()
const realtime = useRealtimeStore()
const ui = useUIStore()

const currentTab = ref('plan')
const transitionName = ref('slide-left')
const error = ref(null)

// Глобальный флаг загрузки
const isAppInitializing = ref(true)
const initError = ref(null)

const tabs = [
  { id: 'plan', label: 'План', icon: 'calendar_today', component: PlanView },
  { id: 'dishes', label: 'Блюда', icon: 'restaurant_menu', component: DishesView },
  { id: 'shopping', label: 'Купить', icon: 'shopping_bag', component: ShoppingView },
  { id: 'products', label: 'Продукты', icon: 'kitchen', component: ProductsView },
  { id: 'settings', label: 'Настройки', icon: 'tune', component: SettingsView }
]

const activeComponent = computed(() => {
  const tab = tabs.find(t => t.id === currentTab.value)
  return tab ? tab.component : PlanView
})

// Логика переключения вкладок с анимацией
const switchTab = (tabId) => {
    if (currentTab.value === tabId) return
    
    const currentIndex = tabs.findIndex(t => t.id === currentTab.value)
    const newIndex = tabs.findIndex(t => t.id === tabId)
    
    transitionName.value = newIndex > currentIndex ? 'slide-left' : 'slide-right'
    
    telegram.haptic.impact('light') 
    currentTab.value = tabId
}

// Единая функция загрузки данных пользователя
const loadUserData = async () => {
    isAppInitializing.value = true 
    initError.value = null
    
    try {
        if (auth.isAuth) {
            // Загружаем данные ПОСЛЕДОВАТЕЛЬНО, чтобы избежать ошибок сети (Load failed)
            // на мобильных устройствах при одновременных запросах
            // Параллельная загрузка данных для ускорения старта
            try {
                await Promise.all([
                    settings.fetchSettings().catch(e => console.error('Settings load failed', e)),
                    dictionaries.fetchDictionaries().catch(e => console.error('Dictionaries load failed', e)),
                    import('./stores/plan').then(m => m.usePlanStore()).then(store => store.fetchPlan()).catch(e => console.error('Plan load failed', e))
                ])
            } catch (e) {
                console.error('Parallel data load error', e)
            }
            
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
    window.addEventListener('online', () => {
        handleAppResume()
        ui.setOffline(false)
    })
    window.addEventListener('offline', () => {
        console.log('🌐 Соединение потеряно');
        ui.setOffline(true)
    })

    // Инициализируем статус сети
    ui.setOffline(!navigator.onLine)

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
    // window listeners are auto-cleaned usually but good practice to remove if we were strict
})
</script>

<template>
  <div class="flex flex-col h-[100dvh] max-w-md mx-auto bg-slate-50 relative overflow-hidden text-slate-900 font-sans selection:bg-amber-100">
    
    <!-- Офлайн индикатор -->
    <div v-if="ui.isOffline" class="fixed top-0 left-0 right-0 bg-slate-900 text-white text-[10px] font-bold text-center py-1 z-[2000] animate-slide-down">
        Нет соединения с интернетом
    </div>

    <!-- Кнопка логов (ВСЕГДА ДОСТУПНА ДЛЯ ОТЛАДКИ) -->
    <button 
      @click="ui.isLogOpen = true" 
      class="fixed bottom-24 left-5 z-[200] w-10 h-10 flex items-center justify-center bg-slate-900/20 text-white/40 rounded-full active:scale-95 backdrop-blur-sm"
    >
      <span class="material-icons-outlined text-lg">bug_report</span>
    </button>

    <AppLogs />
    <ToastContainer />

    <div v-if="isAppInitializing" class="flex-1 flex flex-col items-center justify-center gap-4 bg-white z-[100]">
      <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl animate-bounce">🥗</div>
      <span class="material-icons-round animate-spin text-3xl text-slate-300">sync</span>
      <p class="text-xs font-bold text-slate-300 uppercase tracking-widest">Синхронизация...</p>
    </div>

    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center p-4 text-center bg-slate-50 text-slate-800">
        <span class="material-icons-outlined text-4xl text-slate-400 mb-2">error_outline</span>
        <p class="text-sm font-bold">Произошла ошибка</p>
        <div class="mt-4 p-2 bg-white rounded-lg text-left text-xs w-full overflow-auto" style="max-height: 50vh;">
          <pre>{{ error.stack || error }}</pre>
        </div>
        <button @click="window.location.reload()" class="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Обновить</button>
    </div>

    <div v-else-if="!auth.isAuth" class="flex-1 bg-white">
      <AuthView />
    </div>

    <template v-else>
      <main class="flex-1 relative z-0 overflow-hidden">
        <transition :name="transitionName">
           <component :is="activeComponent" :key="currentTab" class="absolute inset-0 w-full h-full" />
        </transition>
      </main>

      <nav class="pb-safe bg-white z-50 absolute bottom-0 w-full rounded-t-[30px] border-t border-slate-100 transition-transform duration-300"
           :class="{ 'translate-y-full': telegram.isKeyboardOpen }">
        <div class="h-[76px] grid grid-cols-5 items-center px-2">
          <button 
            v-for="tab in tabs" 
            :key="tab.id" 
            @click="switchTab(tab.id)" 
            class="flex flex-col items-center justify-center transition-all duration-200 active:scale-95 group relative" 
          >
            <!-- Special styling for center button (Shopping) -->
            <div v-if="tab.id === 'shopping'" class="w-14 h-14 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-lg shadow-slate-900/20 group-active:scale-95 transition-transform absolute -top-8 border-4 border-slate-50">
                 <span class="material-icons-outlined text-[28px]">shopping_bag</span>
            </div>
            
            <!-- Standard tabs -->
            <div v-else class="flex flex-col items-center justify-center w-full h-full">
                 <div class="w-12 h-8 flex items-center justify-center rounded-full transition-colors duration-200" :class="currentTab === tab.id ? 'bg-slate-100' : 'bg-transparent'">
                    <span class="material-icons-outlined text-[28px] transition-colors duration-200" :class="currentTab === tab.id ? 'text-black' : 'text-slate-300 group-hover:text-slate-500'">{{ tab.icon }}</span>
                 </div>
            </div>
            
          </button>
        </div>
      </nav>
    </template>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
.animate-slide-down {
  animation: slideDown 0.3s ease-out forwards;
}
</style>
