import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { usePlanStore } from './plan'
import { useShoppingStore } from './shopping'
import { useProductStore } from './products'
import { useDishStore } from './dishes'
import { useSettingsStore } from './settings'

export const useRealtimeStore = defineStore('realtime', () => {
  let channel = null

  const init = () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    if (channel) return

    console.log('📡 Подключение к каналу семьи:', auth.householdId)

    // Создаем канал
    channel = supabase.channel(`household-${auth.householdId}`)

    // 1. СЛУШАЕМ БАЗУ ДАННЫХ (Для Плана, Продуктов, Списка покупок)
    // Это работает хорошо, оставляем как есть
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        filter: `household_id=eq.${auth.householdId}`
      },
      (payload) => handleDatabaseUpdate(payload)
    )

    // 2. СЛУШАЕМ "РАДИО" (Для Настроек)
    // Получаем мгновенные команды от других устройств
    channel.on(
      'broadcast',
      { event: 'settings_update' },
      (payload) => {
          console.log('📻 Получен сигнал об обновлении настроек:', payload)
          const settings = useSettingsStore()
          // Мгновенно применяем пришедшие настройки
          settings.startDay = payload.payload.startDay
          settings.periodLength = payload.payload.periodLength
          settings.defaultPortions = payload.payload.defaultPortions
          if (payload.payload.household) {
              // Fix: household is unwrapped by Pinia, so assign directly
              settings.household = payload.payload.household
          }
      }
    )

    // Подписываемся
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('🟢 Синхронизация активна')
    })
  }

  // Функция, чтобы САМОМУ отправить сигнал (вызывается из settings.js)
  const notifySettingsChanged = async (newSettings) => {
      if (!channel) return
      await channel.send({
          type: 'broadcast',
          event: 'settings_update',
          payload: newSettings
      })
  }

  // Обработка изменений из Базы Данных
  const handleDatabaseUpdate = async (payload) => {
    const { table } = payload
    
    // Игнорируем household, так как для него теперь используем Broadcast
    if (table === 'households') return 

    console.log(`⚡ Обновление БД в ${table}, запрашиваем свежие данные...`)

    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()

    // Просто запрашиваем свежие данные в зависимости от того, какая таблица изменилась
    if (table === 'plan') {
      await plan.fetchPlan()
    }
    else if (table === 'shopping_cart') {
      await shopping.fetchChecklist()
    }
    else if (table === 'products') {
      await products.fetchProducts()
    }
    else if (table === 'dishes' || table === 'ingredients' || table === 'dish_tag_links') {
      await dishes.fetchDishes()
    }
  }

  const unsubscribe = () => {
      if (channel) {
          supabase.removeChannel(channel)
          channel = null
      }
  }

  return { init, unsubscribe, notifySettingsChanged }
})