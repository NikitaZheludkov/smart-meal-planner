import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
// Шрифты и иконки — локально, а не с fonts.googleapis.com: внешний CSS
// блокирует показ страницы, и если провайдер замедляет Google, сайт без VPN
// висит белым экраном. Подключаем только реально используемые начертания.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/900.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'
import '@fontsource/montserrat/900.css'
import 'material-icons/iconfont/round.css'
import 'material-icons/iconfont/outlined.css'
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

mountApp()

