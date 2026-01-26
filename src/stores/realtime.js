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

    console.log('📡 Подключение к Realtime для семьи:', auth.householdId)

    // Создаем канал
    channel = supabase.channel('household-sync')

    // 1. СЛУШАЕМ НАСТРОЙКИ (Таблица households)
    // Тут фильтруем по колонке "id", так как это сама таблица семей
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'households',
        filter: `id=eq.${auth.householdId}` // <-- ВАЖНО: id, а не household_id
      },
      (payload) => handleUpdate(payload)
    )

    // 2. СЛУШАЕМ ВСЁ ОСТАЛЬНОЕ (Plan, Products, Shopping...)
    // Тут фильтруем по "household_id", так как эти таблицы принадлежат семье
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        filter: `household_id=eq.${auth.householdId}` // <-- Обычный фильтр
      },
      (payload) => handleUpdate(payload)
    )

    // Подписываемся
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('🟢 Синхронизация активна')
    })
  }

  const handleUpdate = async (payload) => {
    const { table, eventType, new: newRecord, old: oldRecord } = payload
    
    // Игнорируем свои же изменения (опционально), но пока оставим как есть для надежности
    console.log(`⚡ Обновление в ${table}:`, eventType)

    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()
    const settings = useSettingsStore()

    // --- ЛОГИКА ОБНОВЛЕНИЯ ---

    if (table === 'households') {
      console.log('Обновление настроек пришло!')
      settings.periodLength = newRecord.period_length
      settings.startDay = newRecord.start_day
      settings.defaultPortions = newRecord.default_portions
      if (settings.household) {
          settings.household.name = newRecord.name
      }
    }

    else if (table === 'plan') {
      if (eventType === 'INSERT') {
          // Трансформируем запись, чтобы UI не падал без joined полей
          // В идеале можно вызвать fetchPlan(), но для скорости добавим так:
          const item = { ...newRecord, slot: 'Загрузка...' }
          plan.plan.push(item)
          await plan.fetchPlan() // Подгрузим детали (имя блюда и т.д.)
      }
      if (eventType === 'DELETE') {
          plan.plan = plan.plan.filter(i => i.id !== oldRecord.id)
      }
      if (eventType === 'UPDATE') {
        const idx = plan.plan.findIndex(i => i.id === newRecord.id)
        if (idx !== -1) {
            // Аккуратно обновляем поля, сохраняя связи с dishes/products
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

  return { init, unsubscribe }
})