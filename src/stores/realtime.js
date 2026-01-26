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

    // Если уже подключены - не дублируем
    if (channel) return

    console.log('📡 Подключение к Realtime...')

    // Подписываемся на ВСЕ изменения в таблицах, где household_id совпадает с нашим
    channel = supabase
      .channel('household-sync')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          // Фильтр: слушаем только свою семью!
          filter: `household_id=eq.${auth.householdId}` 
        },
        (payload) => {
          handleUpdate(payload)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('🟢 Синхронизация активна')
      })
  }

  // Главный распределитель обновлений
  const handleUpdate = async (payload) => {
    const { table, eventType, new: newRecord, old: oldRecord } = payload
    
    console.log(`⚡ Обновление в ${table}:`, eventType)

    // Используем сторы
    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()
    const settings = useSettingsStore()

    // --- ЛОГИКА ОБНОВЛЕНИЯ ПО ТАБЛИЦАМ ---

    // 1. НАСТРОЙКИ (Таблица households)
    if (table === 'households') {
      // Обновляем локальные настройки мгновенно
      settings.periodLength = newRecord.period_length
      settings.startDay = newRecord.start_day
      settings.defaultPortions = newRecord.default_portions
      if (settings.household) {
          settings.household.name = newRecord.name
      }
    }

    // 2. ПЛАН (Таблица plan)
    else if (table === 'plan') {
      if (eventType === 'INSERT') plan.plan.push(transformPlanItem(newRecord))
      if (eventType === 'DELETE') plan.plan = plan.plan.filter(i => i.id !== oldRecord.id)
      if (eventType === 'UPDATE') {
        const idx = plan.plan.findIndex(i => i.id === newRecord.id)
        if (idx !== -1) Object.assign(plan.plan[idx], newRecord)
      }
      // Для сложных связей (join) проще перезапросить, если пришла новая запись
      if (eventType === 'INSERT') await plan.fetchPlan() 
    }

    // 3. ПОКУПКИ (Таблица shopping_cart)
    else if (table === 'shopping_cart') {
       if (eventType === 'INSERT' || eventType === 'UPDATE') {
           if (newRecord.is_checked) shopping.checkedIds.add(newRecord.product_id)
           else shopping.checkedIds.delete(newRecord.product_id)
       }
       if (eventType === 'DELETE') {
           shopping.checkedIds.delete(oldRecord.product_id)
       }
    }

    // 4. ПРОДУКТЫ (Таблица products)
    else if (table === 'products') {
        if (eventType === 'INSERT') products.products.push(newRecord)
        if (eventType === 'DELETE') products.products = products.products.filter(p => p.id !== oldRecord.id)
        if (eventType === 'UPDATE') {
            const idx = products.products.findIndex(p => p.id === newRecord.id)
            if (idx !== -1) products.products[idx] = newRecord
        }
        // Сортировка по алфавиту после изменений
        products.products.sort((a, b) => a.name.localeCompare(b.name))
    }
    
    // 5. БЛЮДА (Dishes) - тут сложнее из-за ингредиентов
    else if (table === 'dishes' || table === 'ingredients') {
        // Для блюд проще перезагрузить список, чтобы подтянулись связи
        await dishes.fetchDishes()
    }
  }

  // Хелпер: отключаемся при выходе
  const unsubscribe = () => {
      if (channel) {
          supabase.removeChannel(channel)
          channel = null
      }
  }
  
  // Хелпер: заглушка для трансформации (если нужно)
  const transformPlanItem = (item) => ({ ...item, slot: 'loading...' })

  return { init, unsubscribe }
})