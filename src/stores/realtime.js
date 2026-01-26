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

  // Обработка изменений из Базы Данных (как и раньше)
  const handleDatabaseUpdate = async (payload) => {
    const { table, eventType, new: newRecord, old: oldRecord } = payload
    
    // Игнорируем household, так как для него теперь используем Broadcast
    if (table === 'households') return 

    console.log(`⚡ Обновление БД в ${table}:`, eventType)

    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()

    if (table === 'plan') {
      if (eventType === 'INSERT') {
          const item = { ...newRecord, slot: 'Загрузка...' }
          plan.plan.push(item)
          await plan.fetchPlan() 
      }
      if (eventType === 'DELETE') {
          plan.plan = plan.plan.filter(i => i.id !== oldRecord.id)
      }
      if (eventType === 'UPDATE') {
        const idx = plan.plan.findIndex(i => i.id === newRecord.id)
        if (idx !== -1) {
            Object.assign(plan.plan[idx], {
                portions: newRecord.portions,
                ignore_shopping: newRecord.ignore_shopping,
                meal_type_id: newRecord.meal_type_id,
                date: newRecord.date
            })
        }
      }
    }

    else if (table === 'shopping_cart') {
       if (eventType === 'INSERT' || eventType === 'UPDATE') {
           if (newRecord.is_checked) shopping.checkedIds.add(newRecord.product_id)
           else shopping.checkedIds.delete(newRecord.product_id)
       }
       if (eventType === 'DELETE') {
           shopping.checkedIds.delete(oldRecord.product_id)
       }
    }

    else if (table === 'products') {
        if (eventType === 'INSERT') products.products.push(newRecord)
        if (eventType === 'DELETE') products.products = products.products.filter(p => p.id !== oldRecord.id)
        if (eventType === 'UPDATE') {
            const idx = products.products.findIndex(p => p.id === newRecord.id)
            if (idx !== -1) products.products[idx] = newRecord
        }
        products.products.sort((a, b) => a.name.localeCompare(b.name))
    }
    
    else if (table === 'dishes' || table === 'ingredients') {
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