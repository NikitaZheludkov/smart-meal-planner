import { defineStore } from 'pinia'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { usePlanStore } from './plan'
import { useShoppingStore } from './shopping'
import { useProductStore } from './products'
import { useDishStore } from './dishes'
import { useSettingsStore } from './settings'

export const useRealtimeStore = defineStore('realtime', () => {
  let isSubscribed = false

  const init = () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    if (isSubscribed) return

    isSubscribed = true
    console.log('📡 PocketBase Realtime: subscribe, household:', auth.householdId)

    ;(async () => {
      try {
        await pb.collection('*').subscribe('*', (e) => {
          void handleRealtimeEvent(e)
        })
        console.log('🟢 Синхронизация активна')
      } catch (e) {
        console.error('🔴 Ошибка Realtime:', e)
        isSubscribed = false
        setTimeout(() => reconnect(), 5000)
      }
    })()
  }

  const notifySettingsChanged = async (newSettings) => {
      return newSettings
  }

  const handleRealtimeEvent = async (event) => {
    const auth = useAuthStore()
    const collection = event.collectionName
    const record = event.record || null

    const recordHousehold = record?.household || null
    const shouldFilterByHousehold = ['plan', 'shopping_cart', 'products', 'dishes', 'ingredients', 'households'].includes(collection)
    if (shouldFilterByHousehold && recordHousehold && recordHousehold !== auth.householdId) return

    console.log(`⚡ Обновление БД в ${collection}, запрашиваем свежие данные...`)

    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()
    const settings = useSettingsStore()

    if (collection === 'plan') await plan.fetchPlan()
    else if (collection === 'shopping_cart') await shopping.fetchChecklist()
    else if (collection === 'products') await products.fetchProducts()
    else if (collection === 'dishes' || collection === 'ingredients') await dishes.fetchDishes()
    else if (collection === 'households') await settings.fetchSettings()
  }

  const unsubscribe = () => {
    if (!isSubscribed) return
    console.log('🔌 Отключение от канала')
    isSubscribed = false
    try {
      pb.collection('*').unsubscribe('*')
    } catch {}
  }

  const reconnect = () => {
    console.log('🔄 Переподключение Realtime...')
    unsubscribe()
    init()
  }

  return { init, unsubscribe, reconnect, notifySettingsChanged }
})
