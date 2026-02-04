import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTelegramStore = defineStore('telegram', () => {
  // Получаем доступ к объекту Telegram (если он есть)
  const tg = window.Telegram?.WebApp
  
  const user = ref(null)          // Готовый объект пользователя (для отображения имени, аватарки)
  const initData = ref(null)      // СЫРАЯ строка данных (нужна для проверки безопасности на сервере)
  const platform = ref('unknown') // ios, android, tdesktop...
  const isReady = ref(false)
  const isKeyboardOpen = ref(false)

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

    // 3. Настраиваем цвета шапки и фона
    // Цвет #F8FAFC совпадает с твоим фоном в style.css
    const appBgColor = '#F8FAFC' 
    
    try {
        if (tg.setHeaderColor) tg.setHeaderColor(appBgColor)
        if (tg.setBackgroundColor) tg.setBackgroundColor(appBgColor)
    } catch (e) {
        console.log('Настройка цветов не поддерживается этой версией Telegram')
    }

    // 4. Сохраняем данные
    // initDataUnsafe — это просто объект, ему верить нельзя (для UI пойдет)
    user.value = tg.initDataUnsafe?.user || null
    
    // initData — это строка с подписью. Ей верить можно, если проверить на сервере.
    initData.value = tg.initData 
    
    platform.value = tg.platform || 'unknown'
    
    console.log('🦁 Telegram Store initialized on', platform.value)

    // 5. Отслеживаем открытие клавиатуры (визуальный вьюпорт)
    const updateKeyboardState = () => {
      const vv = window.visualViewport
      if (!vv) return
      // Если высота уменьшилась существенно — считаем, что клавиатура открыта
      const delta = window.innerHeight - vv.height
      isKeyboardOpen.value = delta > 120
    }
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateKeyboardState)
        window.visualViewport.addEventListener('scroll', updateKeyboardState)
      }
      window.addEventListener('focusin', () => setTimeout(updateKeyboardState, 0))
      window.addEventListener('focusout', () => setTimeout(updateKeyboardState, 0))
      updateKeyboardState()
    } catch (e) {
      console.log('Keyboard detection not supported')
    }
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
