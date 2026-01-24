import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTelegramStore = defineStore('telegram', () => {
  // Получаем доступ к объекту Telegram (если он есть)
  const tg = window.Telegram?.WebApp
  
  const user = ref(null)
  const platform = ref('unknown') // ios, android, tdesktop...
  const isReady = ref(false)

  // Инициализация (запускаем 1 раз при старте App.vue)
  const init = () => {
    if (!tg) {
        console.log('Telegram WebApp не найден (обычный браузер)')
        return
    }

    // 1. Сообщаем Телеграму, что приложение готово к показу
    tg.ready()
    isReady.value = true

    // 2. Пытаемся развернуть на весь экран
    try {
        tg.expand()
    } catch (e) { console.error('Expand error:', e) }

    // 3. Настраиваем цвета шапки и фона, чтобы они сливались с дизайном
    // Цвет #F8FAFC взят из твоего style.css
    const appBgColor = '#F8FAFC' 
    
    try {
        // Проверяем поддержку методов (для старых версий Telegram)
        if (tg.setHeaderColor) tg.setHeaderColor(appBgColor)
        if (tg.setBackgroundColor) tg.setBackgroundColor(appBgColor)
    } catch (e) {
        console.log('Настройка цветов не поддерживается этой версией Telegram')
    }

    // 4. Сохраняем данные пользователя и платформу
    user.value = tg.initDataUnsafe?.user || null
    platform.value = tg.platform || 'unknown'
    
    console.log('🦁 Telegram Store initialized on', platform.value)
  }

  // --- МЕТОДЫ ВИБРАЦИИ (Haptic Feedback) ---
  
  const haptic = {
    // Легкий удар (для кнопок, переключателей)
    // styles: 'light', 'medium', 'heavy', 'rigid', 'soft'
    impact: (style = 'medium') => {
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred(style)
    },
    
    // Уведомление (успех, ошибка)
    // types: 'error', 'success', 'warning'
    notification: (type = 'success') => {
         if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred(type)
    },
    
    // Выбор (прокрутка списков, пикеров)
    selection: () => {
         if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged()
    }
  }

  // --- УПРАВЛЕНИЕ ГЛАВНОЙ КНОПКОЙ (MainButton) ---
  // Пока просто заглушка, реализуем позже
  const mainButton = {
      show: (text, onClick) => {
          if (!tg?.MainButton) return
          tg.MainButton.text = text
          tg.MainButton.show()
          tg.MainButton.onClick(onClick)
      },
      hide: () => {
          if (!tg?.MainButton) return
          tg.MainButton.hide()
          tg.MainButton.offClick() // Важно отписываться
      }
  }

  return { 
    tg, 
    user, 
    platform, 
    isReady, 
    init,
    haptic,
    mainButton
  }
})