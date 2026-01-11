<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

import PlanView from './views/PlanView.vue'
import DishesView from './views/DishesView.vue'
import ProductsView from './views/ProductsView.vue'
import ShoppingView from './views/ShoppingView.vue'
import SettingsView from './views/SettingsView.vue'
import AuthView from './views/AuthView.vue' 

const auth = useAuthStore()
const currentTab = ref('plan')

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

onMounted(() => {
  auth.initApp()
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.expand()
    window.Telegram.WebApp.ready()
  }
})
</script>

<template>
  <div class="flex flex-col h-[100dvh] max-w-md mx-auto bg-slate-50 relative overflow-hidden text-slate-900 font-sans selection:bg-amber-100">
    
    <div v-if="auth.loading" class="flex-1 flex items-center justify-center">
      <span class="material-icons-round animate-spin text-3xl text-slate-300">sync</span>
    </div>

    <div v-else-if="!auth.isAuth" class="flex-1 bg-white">
      <AuthView />
    </div>

    <template v-else>
      <main class="flex-1 overflow-y-auto no-scrollbar relative z-0">
        <component :is="activeComponent" />
      </main>

      <nav class="pb-safe bg-white/90 backdrop-blur-md border-t border-slate-200 z-50 absolute bottom-0 w-full">
        <div class="h-[60px] grid grid-cols-5 items-center">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            @click="currentTab = tab.id"
            class="flex flex-col items-center justify-center transition-colors duration-200"
            :class="currentTab === tab.id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'"
          >
            <span class="material-icons-round text-[26px] mb-0.5 transition-transform duration-200" :class="currentTab === tab.id ? '-translate-y-1' : ''">{{ tab.icon }}</span>
            <span class="text-[9px] font-bold" v-if="currentTab === tab.id">{{ tab.label }}</span>
          </button>
        </div>
      </nav>
    </template>

  </div>
</template>