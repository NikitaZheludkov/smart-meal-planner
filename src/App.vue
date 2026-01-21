<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useDictionariesStore } from './stores/dictionaries'
import { useSettingsStore } from './stores/settings'

// Импортируем компоненты
import PlanView from './views/PlanView.vue'
import DishesView from './views/DishesView.vue'
import ProductsView from './views/ProductsView.vue'
import ShoppingView from './views/ShoppingView.vue'
import SettingsView from './views/SettingsView.vue'
import AuthView from './views/AuthView.vue' 

const auth = useAuthStore()
const dictionaries = useDictionariesStore()
const settings = useSettingsStore()
const currentTab = ref('plan')

// Глобальный флаг загрузки
const isAppInitializing = ref(true)

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

// Единая функция загрузки данных пользователя
const loadUserData = async () => {
    isAppInitializing.value = true // 1. Включаем экран загрузки
    
    try {
        if (auth.isAuth) {
            // 2. Ждем настройки (КРИТИЧНО для интерфейса)
            await settings.fetchSettings()
            // 3. Справочники грузим параллельно (не блокируем, если не критично)
            dictionaries.fetchDictionaries()
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e)
    } finally {
        // 4. Выключаем экран загрузки (Интерфейс рисуется только сейчас)
        isAppInitializing.value = false
    }
}

// Следим за входом в систему
watch(() => auth.isAuth, (newVal) => {
  if (newVal) {
      // Если пользователь только что вошел - запускаем загрузку
      loadUserData()
  }
})

// Инициализация при первом открытии (F5)
onMounted(async () => {
    await auth.init() // Ждем проверки сессии
    
    if (auth.isAuth) {
        await loadUserData() // Если сессия есть - грузим данные
    } else {
        isAppInitializing.value = false // Если нет - просто показываем AuthView
    }

    // Telegram Cosmetics
    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.expand()
        window.Telegram.WebApp.ready()
        window.Telegram.WebApp.setHeaderColor('#F8FAFC') 
        window.Telegram.WebApp.setBackgroundColor('#F8FAFC')
    }
})
</script>

<template>
  <div class="flex flex-col h-[100dvh] max-w-md mx-auto bg-slate-50 relative overflow-hidden text-slate-900 font-sans selection:bg-amber-100">
    
    <div v-if="isAppInitializing" class="flex-1 flex flex-col items-center justify-center gap-4 bg-white z-[100]">
      <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl animate-bounce">🥗</div>
      <span class="material-icons-round animate-spin text-3xl text-slate-300">sync</span>
      <p class="text-xs font-bold text-slate-300 uppercase tracking-widest">Синхронизация...</p>
    </div>

    <div v-else-if="!auth.isAuth" class="flex-1 bg-white">
      <AuthView />
    </div>

    <template v-else>
      <main class="flex-1 overflow-y-auto no-scrollbar relative z-0">
        <transition name="fade" mode="out-in">
           <component :is="activeComponent" />
        </transition>
      </main>

      <nav class="pb-safe bg-white/95 backdrop-blur-xl border-t border-slate-100/50 z-50 absolute bottom-0 w-full rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div class="h-[76px] grid grid-cols-5 items-center">
          <button v-for="tab in tabs" :key="tab.id" @click="currentTab = tab.id" class="flex flex-col items-center justify-center transition-colors duration-200 pb-2 active:scale-95 transition-transform" :class="currentTab === tab.id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'">
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