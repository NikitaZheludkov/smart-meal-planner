import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import { useRealtimeStore } from './realtime' // <-- Импортируем Realtime
import { useUIStore } from './ui'
import { usePlanStore } from './plan'
import { useDishStore } from './dishes'
import { useProductStore } from './products'
import { useShoppingStore } from './shopping'
import { pb } from '../lib/supabase'

export const useSettingsStore = defineStore('settings', () => {
  const startDay = ref(1) 
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  
  const household = ref(null)      
  const familyMembers = ref([])
  const loading = ref(false)
  const withTimeout = async (promise, ms) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }
  
  const fetchSettings = async () => {
    const auth = useAuthStore()
    const ui = useUIStore()

    // Ждем авторизации более надежно (до 20 секунд)
    let attempts = 0
    // Если auth.loading === true, значит процесс еще идет, ждем его окончания
    while ((auth.loading || !auth.user) && attempts < 100) {
      await new Promise(r => setTimeout(r, 200))
      attempts++
    }

    if (!auth.user) {
        console.warn('Settings: Auth timeout exceeded or user not found')
        // Не блокируем UI ошибкой, возможно юзер просто не залогинен
        return
    }

    loading.value = true
    try {
      const hhId = auth.householdId
      if (!hhId) return
      await fetchHouseholdDetails(hhId)
    } catch (e) { 
        console.error('Ошибка загрузки настроек:', e) 
        ui.addLog('Ошибка загрузки настроек', 'error', e)
    } finally {
        loading.value = false
    }
  }
  
  const fetchHouseholdDetails = async (householdId) => {
      const hhData = await withTimeout(pb.collection('households').getOne(householdId), 20000)

      if (hhData) {
          household.value = hhData
          startDay.value = Number(hhData.start_day ?? 1)
          periodLength.value = Number(hhData.period_length ?? 7)
          defaultPortions.value = Number(hhData.default_portions ?? 1)
          const ui = useUIStore()
          ui.addLog('Настройки семьи загружены')
      }

      const members = await pb.collection('users').getFullList({
          filter: `household="${householdId}"`,
          fields: 'id,email,first_name,username'
      })

      familyMembers.value = (members || []).map((m) => {
          const name = (m.first_name || m.username || '').toString().trim()
          const email = (m.email || '').toString().trim()
          return {
              ...m,
              displayName: name || (email ? email.split('@')[0] : 'Пользователь')
          }
      })
  }

  const removeMember = async (userId) => {
      const auth = useAuthStore()
      const ui = useUIStore()
      const hh = household.value

      if (!auth.user?.id) throw new Error('Пользователь не найден')
      if (!hh?.id) throw new Error('Семья не найдена')
      if (!userId) throw new Error('Участник не найден')

      if (userId === auth.user.id) {
          ui.showToast('Нельзя исключить самого себя', 'error')
          return
      }

      if (userId === hh.owner) {
          ui.showToast('Нельзя исключить владельца семьи', 'error')
          return
      }

      await withTimeout(pb.collection('users').update(userId, { household: null }), 15000)
      familyMembers.value = familyMembers.value.filter((m) => m.id !== userId)
      ui.showToast('Участник исключён', 'success')
  }

  const transferOwnership = async (newOwnerId) => {
      const auth = useAuthStore()
      const ui = useUIStore()
      const hh = household.value
      const hhId = hh?.id

      if (!auth.user?.id) throw new Error('Пользователь не найден')
      if (!hhId) throw new Error('Семья не найдена')
      if (!newOwnerId) throw new Error('Участник не найден')

      if (newOwnerId === hh.owner) {
          ui.showToast('Пользователь уже является владельцем', 'warn')
          return
      }

      if (newOwnerId === auth.user.id) {
          ui.showToast('Нельзя передать права самому себе', 'error')
          return
      }

      await withTimeout(pb.collection('households').update(hhId, { owner: newOwnerId }), 15000)

      household.value = { ...household.value, owner: newOwnerId }
      ui.showToast('Права владельца переданы', 'success')
  }

  // --- ГЛАВНОЕ ИЗМЕНЕНИЕ ЗДЕСЬ ---
  const saveSettings = async (day, period, portions) => {
    const auth = useAuthStore()
    if (!auth.householdId) {
        throw new Error('Учётная запись не авторизована. Сохранение настроек невозможно.')
    }

    // 1. Обновляем у себя локально
    startDay.value = Number(day)
    periodLength.value = Number(period)
    defaultPortions.value = Number(portions)
    
    if (household.value?.id) {
        // 2. Сохраняем в базу данных (чтобы не пропало при перезагрузке)
        await withTimeout(
            pb.collection('households').update(household.value.id, { 
                start_day: day, 
                period_length: period, 
                default_portions: portions 
            }),
            5000
        )

        // 3. ОТПРАВЛЯЕМ СИГНАЛ ВСЕМ ОСТАЛЬНЫМ (Broadcast)
        // Это гарантирует, что другие устройства получат обновление мгновенно
        const realtime = useRealtimeStore()
        await realtime.notifySettingsChanged({
            startDay: day,
            periodLength: period,
            defaultPortions: portions,
            household: household.value
        })
    }
  }

  const generateInviteCode = async () => {
      if (!household.value) throw new Error('Семья не найдена')
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const data = await pb.collection('households').update(household.value.id, { invite_code: code })
      if (data) household.value = data 
  }

  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      const ui = useUIStore()
      if (!code || code.length < 6) {
          ui.showToast('Код должен состоять из 6 цифр', 'error')
          throw new Error('Неверный код')
      }
      
      const targetHousehold = await pb.collection('households').getFirstListItem(`invite_code="${code}"`, { fields: 'id' })
      
      if (!targetHousehold) {
          ui.showToast('Семья с таким кодом не найдена', 'error')
          throw new Error('Неверный код')
      }

      if (!auth.user?.id) throw new Error('Пользователь не найден')
      await pb.collection('users').update(auth.user.id, { household: targetHousehold.id })
      
      ui.showToast('Вы присоединились к семье!', 'success')

      await auth.refreshSession()

      const realtime = useRealtimeStore()
      realtime.reconnect()

      const plan = usePlanStore()
      const dishes = useDishStore()
      const products = useProductStore()
      const shopping = useShoppingStore()

      await Promise.allSettled([
          fetchSettings(),
          plan.fetchPlan(),
          dishes.fetchDishes(),
          products.fetchProducts(),
          shopping.fetchChecklist()
      ])
  }

  const leaveHousehold = async () => {
      const auth = useAuthStore()
      const ui = useUIStore()
      
      if (!auth.user?.id) throw new Error('Пользователь не найден')

      let myOwnHousehold = null
      try {
          myOwnHousehold = await pb.collection('households').getFirstListItem(`owner="${auth.user.id}"`, { fields: 'id' })
      } catch {
          myOwnHousehold = null
      }

      if (!myOwnHousehold) {
          const newHousehold = await pb.collection('households').create({
              name: 'Моя семья',
              owner: auth.user.id,
              start_day: 1,
              period_length: 7,
              default_portions: 2
          })
           if (newHousehold) {
                await pb.collection('users').update(auth.user.id, { household: newHousehold.id })
                ui.showToast('Создана новая семья', 'success')
                await auth.refreshSession()

                const realtime = useRealtimeStore()
                realtime.reconnect()

                const plan = usePlanStore()
                const dishes = useDishStore()
                const products = useProductStore()
                const shopping = useShoppingStore()

                await Promise.allSettled([
                    fetchSettings(),
                    plan.fetchPlan(),
                    dishes.fetchDishes(),
                    products.fetchProducts(),
                    shopping.fetchChecklist()
                ])
                return
           }
           throw new Error('Не удалось создать новую семью')
      }
      
      await pb.collection('users').update(auth.user.id, { household: myOwnHousehold.id })
      
      ui.showToast('Вы вернулись в свою семью', 'success')

      await auth.refreshSession()

      const realtime = useRealtimeStore()
      realtime.reconnect()

      const plan = usePlanStore()
      const dishes = useDishStore()
      const products = useProductStore()
      const shopping = useShoppingStore()

      await Promise.allSettled([
          fetchSettings(),
          plan.fetchPlan(),
          dishes.fetchDishes(),
          products.fetchProducts(),
          shopping.fetchChecklist()
      ])
  }

  return { 
      startDay, periodLength, defaultPortions, 
      household, familyMembers, loading,
      fetchSettings, saveSettings,
      generateInviteCode, joinHousehold, leaveHousehold,
      removeMember,
      transferOwnership
  }
})
