import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTelegramStore = defineStore('telegram', () => {
  let tg = window.Telegram?.WebApp

  const user = ref(null)
  const initData = ref(null)
  const platform = ref('unknown')
  const isReady = ref(false)
  const isKeyboardOpen = ref(false)

  // Инициализация (запускаем 1 раз при старте App.vue)
  const init = () => {
    // Переносим получение tg сюда и добавляем проверку
    tg = window.Telegram?.WebApp
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

    // 3. Настраиваем цвета шапки и фона
    const appBgColor = '#F8FAFC' 
    
    try {
        if (tg.setHeaderColor) tg.setHeaderColor(appBgColor)
        if (tg.setBackgroundColor) tg.setBackgroundColor(appBgColor)
    } catch (e) {
        console.log('Настройка цветов не поддерживается этой версией Telegram')
    }

    // 4. Сохраняем данные
    user.value = tg.initDataUnsafe?.user || null
    initData.value = tg.initData 
    platform.value = tg.platform || 'unknown'
    
    console.log('🦁 Telegram Store initialized on', platform.value)
    
    // Проверка версии для избежания ошибок на старых клиентах
    const isVersionSupported = (minVersion) => {
        return tg.isVersionAtLeast ? tg.isVersionAtLeast(minVersion) : false
    }

    try {
      if (isVersionSupported('6.2')) {
        tg.enableClosingConfirmation(true)
      }
    } catch (e) {}

    // 5. Отслеживаем открытие клавиатуры по фокусу на полях ввода
    const isInputLike = (el) => {
      if (!el) return false
      const tag = (el.tagName || '').toUpperCase()
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    window.addEventListener('focusin', (e) => {
      if (isInputLike(e.target)) {
        isKeyboardOpen.value = true
      }
    }, true)

    window.addEventListener('focusout', (e) => {
      if (isInputLike(e.target)) {
        isKeyboardOpen.value = false
      }
    }, true)

    try {
      tg.onEvent('viewportChanged', () => {
        try { tg.expand() } catch (e) {}
      })
    } catch (e) {}
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
          tg.MainButton.offClick()
      },
      showProgress: (leaveActive = false) => {
          if (tg?.MainButton) tg.MainButton.showProgress(leaveActive)
      },
      hideProgress: () => {
          if (tg?.MainButton) tg.MainButton.hideProgress()
      }
  }

  return { 
    tg, 
    user, 
    initData, // <--- Важно: теперь мы возвращаем это поле
    platform, 
    isReady,
    isKeyboardOpen,
    init,
    haptic,
    mainButton
  }
})
