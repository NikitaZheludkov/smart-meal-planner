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

app.mount('#app')

