import { defineStore } from 'pinia'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { usePlanStore } from './plan'
import { useShoppingStore } from './shopping'
import { useProductStore } from './products'
import { useDishStore } from './dishes'
import { useSettingsStore } from './settings'
import { withTimeout } from '../lib/utils'

export const useRealtimeStore = defineStore('realtime', () => {
  let isSubscribed = false
  let subscribedHouseholdId = null
  let debounceTimer = null
  let watchdogTimer = null
  let lastEventAt = 0

  const pendingRefresh = new Set()
  const inFlight = new Set()

  const subscriptions = [
    { name: 'plan', filter: (hhId) => `household="${hhId}"` },
    { name: 'shopping_cart', filter: (hhId) => `household="${hhId}"` },
    { name: 'products', filter: (hhId) => `household="${hhId}"` },
    { name: 'dishes', filter: (hhId) => `household="${hhId}"` },
    { name: 'ingredients', filter: (hhId) => `household="${hhId}"` },
    { name: 'households', filter: (hhId) => `id="${hhId}"` }
  ]

  const getRealtimeConnectedState = () => {
    const rt = pb?.realtime
    if (!rt) return null
    if (typeof rt.isConnected === 'boolean') return rt.isConnected
    const es = rt.eventSource || rt._eventSource || rt.es || rt._es
    if (es && typeof es.readyState === 'number') return es.readyState === 1
    return null
  }

  const scheduleFlush = () => {
    if (debounceTimer) return
    debounceTimer = window.setTimeout(async () => {
      debounceTimer = null
      const keys = Array.from(pendingRefresh)
      pendingRefresh.clear()
      await flushRefresh(keys)
    }, 250)
  }

  const requestRefresh = (key) => {
    pendingRefresh.add(key)
    scheduleFlush()
  }

  const flushRefresh = async (keys) => {
    if (!keys.length) return

    const plan = usePlanStore()
    const shopping = useShoppingStore()
    const products = useProductStore()
    const dishes = useDishStore()
    const settings = useSettingsStore()

    const tasks = []
    for (const key of keys) {
      if (inFlight.has(key)) continue
      inFlight.add(key)
      if (key === 'plan') tasks.push(plan.fetchPlan().finally(() => inFlight.delete(key)))
      else if (key === 'shopping_cart') tasks.push(shopping.fetchChecklist().finally(() => inFlight.delete(key)))
      else if (key === 'products') tasks.push(products.fetchProducts().finally(() => inFlight.delete(key)))
      else if (key === 'dishes') tasks.push(dishes.fetchDishes().finally(() => inFlight.delete(key)))
      else if (key === 'households') tasks.push(settings.fetchSettings().finally(() => inFlight.delete(key)))
      else inFlight.delete(key)
    }
    await Promise.allSettled(tasks)
  }

  const handleRealtimeEvent = async (event) => {
    const auth = useAuthStore()
    const hhId = auth.householdId
    if (!hhId) return

    lastEventAt = Date.now()

    const collection = event.collectionName
    const record = event.record || null

    if (collection === 'households') {
      if (record?.id && record.id !== hhId) return
      requestRefresh('households')
      return
    }

    const recordHousehold = record?.household || null
    if (recordHousehold && recordHousehold !== hhId) return

    if (collection === 'plan') requestRefresh('plan')
    else if (collection === 'shopping_cart') requestRefresh('shopping_cart')
    else if (collection === 'products') requestRefresh('products')
    else if (collection === 'dishes' || collection === 'ingredients') requestRefresh('dishes')
  }

  const subscribeAll = async (hhId) => {
    for (const s of subscriptions) {
      await pb.collection(s.name).subscribe(
        '*',
        (e) => {
          void handleRealtimeEvent(e)
        },
        { filter: s.filter(hhId) }
      )
    }
  }

  const startWatchdog = () => {
    stopWatchdog()
    watchdogTimer = window.setInterval(async () => {
      if (!isSubscribed || !subscribedHouseholdId) return

      const connected = getRealtimeConnectedState()
      if (connected === false) {
        isSubscribed = false
        subscribedHouseholdId = null
        setTimeout(() => reconnect(), 1000)
        return
      }

      const tooQuiet = lastEventAt > 0 && Date.now() - lastEventAt > 90_000
      if (!tooQuiet) return

      try {
        await withTimeout(pb.collection('households').getOne(subscribedHouseholdId, { fields: 'id' }), 5000)
      } catch {
        isSubscribed = false
        subscribedHouseholdId = null
        setTimeout(() => reconnect(), 1000)
      }
    }, 20_000)
  }

  const stopWatchdog = () => {
    if (!watchdogTimer) return
    window.clearInterval(watchdogTimer)
    watchdogTimer = null
  }

  const init = () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    if (isSubscribed && subscribedHouseholdId === auth.householdId) return

    void (async () => {
      unsubscribe()
      isSubscribed = true
      subscribedHouseholdId = auth.householdId
      lastEventAt = Date.now()

      try {
        await subscribeAll(auth.householdId)
        startWatchdog()
      } catch (e) {
        console.error('🔴 Ошибка Realtime:', e)
        isSubscribed = false
        subscribedHouseholdId = null
        setTimeout(() => reconnect(), 5000)
      }
    })()
  }

  const notifySettingsChanged = async (newSettings) => {
      return newSettings
  }

  const unsubscribe = () => {
    if (!isSubscribed) return
    isSubscribed = false
    subscribedHouseholdId = null
    stopWatchdog()
    if (debounceTimer) {
      window.clearTimeout(debounceTimer)
      debounceTimer = null
    }
    pendingRefresh.clear()
    inFlight.clear()
    try {
      for (const s of subscriptions) {
        try {
          pb.collection(s.name).unsubscribe('*')
        } catch {}
      }
    } catch {}
  }

  const reconnect = () => {
    unsubscribe()
    init()
  }

  return { init, unsubscribe, reconnect, notifySettingsChanged }
})
