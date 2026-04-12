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
    // 1. Отслеживаем клавиатуру (работает везде)
    const isInputLike = (el) => {
        if (!el) return false
        const tag = (el.tagName || '').toUpperCase()
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    window.addEventListener('focusin', (e) => {
        if (isInputLike(e.target)) isKeyboardOpen.value = true
    }, true)

    window.addEventListener('focusout', (e) => {
        if (isInputLike(e.target)) isKeyboardOpen.value = false
    }, true)

    // 2. Инициализация специфичных для TG функций
    tg = window.Telegram?.WebApp
    if (!tg) {
      console.log('Telegram WebApp не найден (обычный браузер)')
      return
    }

    tg.ready()
    isReady.value = true

    try {
        tg.expand()
    } catch (e) { console.error('Expand error:', e) }

    const appBgColor = '#F8FAFC' 
    
    try {
        if (tg.setHeaderColor) tg.setHeaderColor(appBgColor)
        if (tg.setBackgroundColor) tg.setBackgroundColor(appBgColor)
    } catch (e) {
        console.log('Настройка цветов не поддерживается этой версией Telegram')
    }

    user.value = tg.initDataUnsafe?.user || null
    initData.value = tg.initData 
    platform.value = tg.platform || 'unknown'
    
    console.log('🦁 Telegram Store initialized on', platform.value)
    
    const isVersionSupported = (minVersion) => {
        return tg.isVersionAtLeast ? tg.isVersionAtLeast(minVersion) : false
    }

    try {
      if (isVersionSupported('6.2')) {
        tg.enableClosingConfirmation(true)
      }
    } catch (e) {}

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
