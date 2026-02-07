import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

app.config.errorHandler = (err, instance, info) => {
  if (instance) {
    instance.$root.error = err
  }
  console.error('Ошибка Vue:', err, info)
}

window.addEventListener('unhandledrejection', (event) => {
  const root = app._container._vnode.component.proxy
  if (root) {
    root.error = event.reason
  }
  console.error('Необработанный Promise rejection:', event.reason)
})

function mountApp() {
  app.mount('#app')
}

// Проверяем, доступен ли объект Telegram WebApp
if (window.Telegram && window.Telegram.WebApp) {
  // Если да, ждем события ready
  window.Telegram.WebApp.ready()
  mountApp()
} else {
  // Если нет (например, открыто в обычном браузере), монтируем сразу
  mountApp()
}

