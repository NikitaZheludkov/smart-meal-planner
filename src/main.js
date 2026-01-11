import { createApp } from 'vue'
import { createPinia } from 'pinia' // 1. Импортируем Pinia
import './style.css'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia()) // 2. Включаем Pinia
app.mount('#app')