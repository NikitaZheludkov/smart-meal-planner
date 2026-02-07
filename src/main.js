import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import { useDebugStore } from '@/stores/debug'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const debugStore = useDebugStore()
app.config.errorHandler = (err, instance, info) => {
  debugStore.addLog(err, info)
  console.error('Ошибка Vue:', err, info)
}

window.addEventListener('unhandledrejection', (event) => {
  debugStore.addLog(event.reason, 'Unhandled Promise Rejection')
  console.error('Необработанный Promise rejection:', event.reason)
})

app.mount('#app')
