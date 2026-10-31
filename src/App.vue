<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useDictionariesStore } from './stores/dictionaries'
import { useSettingsStore } from './stores/settings'
import { usePlatformStore } from './stores/platform'
import { useRealtimeStore } from './stores/realtime'
import { useUIStore } from './stores/ui'
import { usePlanStore } from './stores/plan'
import { useDishStore } from './stores/dishes'
import { useProductStore } from './stores/products'
import { useAppConfigStore } from './stores/appConfig'

// Импортируем компоненты страниц
import PlanView from './views/PlanView.vue'
import CatalogView from './views/CatalogView.vue'
import ShoppingView from './views/ShoppingView.vue'
import SettingsView from './views/SettingsView.vue'
import AuthView from './views/AuthView.vue'
import ResetPasswordView from './views/ResetPasswordView.vue'
import ToastContainer from './components/ToastContainer.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import TelegramLinkPromptModal from './components/TelegramLinkPromptModal.vue'
import AnnouncementSheet from './components/AnnouncementSheet.vue'
import OnboardingTour from './components/OnboardingTour.vue'
import { TOUR_VERSION } from './lib/tour'

const auth = useAuthStore()
const dictionaries = useDictionariesStore()
const settings = useSettingsStore()
const platform = usePlatformStore()
const realtime = useRealtimeStore()
const ui = useUIStore()
const appConfig = useAppConfigStore()

const currentTab = ref('plan')
const transitionName = ref('slide-left')
const error = ref(null)

// Глобальный флаг загрузки
const isAppInitializing = ref(true)
const initError = ref(null)

// Ссылка для сброса пароля из письма PocketBase: /?resetToken=...
const resetPasswordToken = ref(new URLSearchParams(window.location.search).get('resetToken'))
const clearResetPasswordToken = () => {
    resetPasswordToken.value = null
    const url = new URL(window.location.href)
    url.searchParams.delete('resetToken')
    window.history.replaceState({}, '', url)
}

// Флаг синхронизации
const isSyncing = ref(false)

const tabs = [
  { id: 'plan', label: 'План', icon: 'calendar_today', component: PlanView },
  { id: 'catalog', label: 'Каталог', icon: 'restaurant_menu', component: CatalogView },
  { id: 'shopping', label: 'Купить', icon: 'shopping_bag', component: ShoppingView },
  { id: 'sync', label: 'Синхронизация', icon: 'sync', isAction: true },
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
    
    currentTab.value = tabId
}

// Логика принудительной синхронизации
const handleSync = async () => {
    isSyncing.value = true
    try {
        await loadUserData()
        ui.showToast('Синхронизация выполнена', 'success')
    } catch (e) {
        console.error('Ошибка синхронизации:', e)
        ui.showToast('Ошибка синхронизации', 'error')
    } finally {
        isSyncing.value = false
    }
}

// Единая функция загрузки данных пользователя.
// Гвард на конкурентный вызов: и watch(auth.isAuth), и onMounted могут
// захотеть запустить загрузку почти одновременно (auth.init() меняет
// isAuth изнутри, что планирует срабатывание watcher'а ещё до того, как
// onMounted сам проверит auth.isAuth и вызовет эту функцию) — без гварда
// это дублирует все запросы и повторно запускает realtime.init().
let loadUserDataPromise = null
const loadUserData = () => {
    if (loadUserDataPromise) return loadUserDataPromise

    loadUserDataPromise = (async () => {
        isAppInitializing.value = true
        initError.value = null

        try {
            if (auth.isAuth) {
                // Параллельная загрузка данных для ускорения старта
                try {
                    await Promise.all([
                        settings.fetchSettings().catch(e => console.error('Settings load failed', e)),
                        dictionaries.fetchDictionaries().catch(e => console.error('Dictionaries load failed', e)),
                        usePlanStore().fetchPlan().catch(e => console.error('Plan load failed', e)),
                        useDishStore().fetchDishes().catch(e => console.error('Dishes load failed', e)),
                        useProductStore().fetchProducts().catch(e => console.error('Products load failed', e)),
                        appConfig.fetchConfig(),
                        appConfig.checkAdmin()
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
    })()

    return loadUserDataPromise.finally(() => {
        loadUserDataPromise = null
    })
}

// Новичку один раз показываем мини-гайд — когда данные загрузились и
// приложение уже на экране
watch(() => auth.isAuth && !isAppInitializing.value, (ready) => {
  if (ready && !auth.hasSeenTour(TOUR_VERSION)) ui.openTour()
}, { immediate: true })

// Если статус авторизации меняется (например, вошли), грузим данные
watch(() => auth.isAuth, (newVal) => {
  if (newVal) loadUserData()
  else appConfig.isAdmin = false
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
        platform.init()

        // Разворачиваем Mini App на всю высоту сразу, независимо от того,
        // есть ли уже сессия — иначе Telegram открывает приложение в
        // свёрнутом виде и вёрстка (особенно шапка) уезжает.
        const tgWebApp = window.Telegram?.WebApp
        if (tgWebApp) {
            tgWebApp.ready()
            tgWebApp.expand()

            // Собственная шапка Telegram (кнопка "Закрыть", свайп-стрелка)
            // перекрывает верх нашего контента, если её высоту не учитывать
            // в отступе — contentSafeAreaInset как раз даёт эту высоту.
            // Значение может меняться (поворот экрана, апдейт клиента),
            // поэтому подписываемся на событие, а не читаем один раз.
            const applyTelegramHeaderInset = () => {
                const top = tgWebApp.contentSafeAreaInset?.top ?? 0
                document.documentElement.style.setProperty('--tg-header-inset', `${top}px`)
            }
            applyTelegramHeaderInset()
            tgWebApp.onEvent?.('contentSafeAreaChanged', applyTelegramHeaderInset)
        }

        // Настройки приложения нужны и до входа (например, закрыта ли регистрация)
        appConfig.fetchConfig()

        await auth.init()

        // Если локальной сессии нет, но приложение открыто внутри Telegram
        // Mini App — пробуем войти по initData вместо показа формы логина.
        // Telegram уже подтвердил личность пользователя, пароль не нужен.
        if (!auth.isAuth) {
            const tg = tgWebApp
            if (tg?.initData) {
                try {
                    await auth.signInWithTelegram(tg.initData)
                } catch (e) {
                    console.error('Автовход через Telegram не удался, показываем обычный вход:', e)
                    // Не блокируем пользователя ошибкой одного конкретного способа
                    // входа — просто откатываемся на обычную форму email/пароль.
                    auth.authStatus = 'idle'
                    auth.authError = null
                }
            }
        }

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
  <div class="flex flex-col h-[100dvh] max-w-md mx-auto bg-white relative overflow-hidden text-slate-900 font-sans selection:bg-amber-100">
    
    <!-- Офлайн индикатор -->
    <div v-if="ui.isOffline" class="fixed top-0 left-0 right-0 bg-slate-900 text-white text-[10px] font-bold text-center py-1 z-[2000] animate-slide-down">
        Нет соединения с интернетом
    </div>

    <!-- Загрузка → вход → приложение: мягкая смена экранов -->
    <Transition name="fade" mode="out-in">
    <div v-if="resetPasswordToken" class="flex-1 bg-white">
      <ResetPasswordView :token="resetPasswordToken" @done="clearResetPasswordToken" />
    </div>

    <div v-else-if="isAppInitializing" class="flex-1 flex flex-col items-center justify-center gap-4 bg-white z-[100]">
      <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl animate-bounce">🥗</div>
      <span class="material-icons-round animate-spin text-3xl text-slate-300">sync</span>
      <p class="text-xs font-bold text-slate-300 uppercase tracking-widest">Синхронизация...</p>
    </div>

    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center p-4 text-center bg-white text-slate-800">
        <span class="material-icons-outlined text-4xl text-slate-400 mb-2">error_outline</span>
        <p class="text-sm font-bold">Произошла ошибка</p>
        <div class="mt-4 p-2 bg-slate-50 rounded-lg text-left text-xs w-full overflow-auto" style="max-height: 50vh;">
          <pre>{{ error.stack || error }}</pre>
        </div>
        <button @click="window.location.reload()" class="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Обновить</button>
    </div>

    <div v-else-if="!auth.isAuth" class="flex-1 bg-white">
      <AuthView />
    </div>

    <div v-else class="flex-1 flex flex-col relative min-h-0">
      <main class="flex-1 relative z-0 overflow-hidden bg-slate-50">
        <transition :name="transitionName" mode="out-in">
           <component :is="activeComponent" :key="currentTab" class="absolute inset-0 w-full h-full" />
        </transition>
      </main>

      <nav class="pb-safe bg-white z-50 absolute bottom-0 w-full rounded-t-[30px] border-t border-slate-100 transition-transform duration-300"
           :class="{ 'translate-y-full': platform.isKeyboardOpen || ui.isModalOpen || ui.isConfirmOpen }">
        <div class="h-[76px] grid grid-cols-5 items-center px-2">
          <button 
            v-for="tab in tabs" 
            :key="tab.id" 
            @click="tab.isAction ? handleSync() : switchTab(tab.id)" 
            class="flex flex-col items-center justify-center transition-all duration-200 active:scale-95 group relative" 
          >
            <!-- Special styling for center button (Shopping) -->
            <div v-if="tab.id === 'shopping'" class="w-14 h-14 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-lg shadow-slate-900/20 group-active:scale-95 transition-transform absolute -top-8 border-4 border-slate-50">
                 <span class="material-icons-outlined text-[28px]">shopping_bag</span>
            </div>
            
            <!-- Sync button with spinner -->
            <div v-else-if="tab.id === 'sync'" class="flex flex-col items-center justify-center w-full h-full">
                 <div class="w-12 h-8 flex items-center justify-center rounded-full transition-colors duration-200">
                    <span class="material-icons-outlined text-[28px] transition-colors duration-200" :class="isSyncing ? 'text-black animate-spin' : 'text-slate-300 group-hover:text-slate-500'">{{ tab.icon }}</span>
                 </div>
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
    </div>
    </Transition>
    <ToastContainer />
    <ConfirmModal />
    <TelegramLinkPromptModal />
    <AnnouncementSheet v-if="auth.isAuth && !isAppInitializing && !ui.isTourOpen" />
    <OnboardingTour v-if="auth.isAuth" />
  </div>
</template>

<style>
@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
.animate-slide-down {
  animation: slideDown 0.3s ease-out forwards;
}
</style>
