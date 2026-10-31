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
import { withTimeout, withRetry } from '../lib/utils'

export const useSettingsStore = defineStore('settings', () => {
  const startDay = ref(1)
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  // Приёмы пищи, скрытые в сетке недели (общая настройка семьи)
  const hiddenMealTypes = ref([])
  // Выходные дни семьи: 0 = вс … 6 = сб. По умолчанию суббота и воскресенье.
  const DEFAULT_WEEKEND = [6, 0]
  const weekendDays = ref(DEFAULT_WEEKEND)

  const household = ref(null)
  const familyMembers = ref([])
  const loading = ref(false)

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
          hiddenMealTypes.value = Array.isArray(hhData.hidden_meal_types) ? hhData.hidden_meal_types : []
          weekendDays.value = Array.isArray(hhData.weekend_days) ? hhData.weekend_days.map(Number) : DEFAULT_WEEKEND
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
          ui.showToast('Себя убрать из семьи нельзя', 'error')
          return
      }

      if (userId === hh.owner) {
          ui.showToast('Владельца семьи убрать нельзя', 'error')
          return
      }

      // Чужой профиль менять напрямую нельзя — это делает сервер после проверки,
      // что вы владелец семьи
      try {
          await withTimeout(pb.send('/api/household/remove-member', { method: 'POST', body: { userId } }), 15000)
      } catch (e) {
          throw new Error(e?.response?.message || e?.message || 'Не удалось убрать участника')
      }
      familyMembers.value = familyMembers.value.filter((m) => m.id !== userId)
      ui.showToast('Участник больше не в вашей семье', 'success')
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
      // Код уникален среди всех семей — при редком совпадении пробуем ещё раз
      for (let attempt = 0; attempt < 5; attempt++) {
          const code = Math.floor(100000 + Math.random() * 900000).toString()
          try {
              const data = await pb.collection('households').update(household.value.id, { invite_code: code })
              if (data) household.value = data
              return
          } catch (e) {
              if (e?.data?.data?.invite_code?.code !== 'validation_not_unique') throw e
          }
      }
      throw new Error('Не удалось создать код, попробуйте ещё раз')
  }

  // После смены семьи (вступили по коду, вернулись к своему плану) всё
  // перечитываем заново: профиль с новой семьёй, подписку на обновления и
  // данные. Продукты — до блюд: по ним подписываются ингредиенты.
  const reloadHouseholdData = async () => {
      const auth = useAuthStore()
      await auth.refreshSession()
      useRealtimeStore().reconnect()

      const plan = usePlanStore()
      const dishes = useDishStore()
      const products = useProductStore()
      const shopping = useShoppingStore()

      await Promise.allSettled([fetchSettings(), products.fetchProducts(), shopping.fetchChecklist()])
      await Promise.allSettled([dishes.fetchDishes(), plan.fetchPlan()])
  }

  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      const ui = useUIStore()
      const cleanCode = String(code || '').replace(/\D/g, '')
      if (cleanCode.length !== 6) throw new Error('Код должен состоять из 6 цифр')
      if (!auth.user?.id) throw new Error('Пользователь не найден')

      // Чужую семью по коду ищет и подключает сервер: обычным запросом её
      // не найти — правила доступа показывают только свою семью
      let joined
      try {
          joined = await withTimeout(pb.send('/api/household/join', { method: 'POST', body: { code: cleanCode } }), 15000)
      } catch (e) {
          throw new Error(e?.response?.message || e?.message || 'Не удалось подключиться к семье')
      }

      await reloadHouseholdData()
      // название не показываем: у большинства семей оно стандартное «Моя семья»
      if (joined?.household) ui.showToast('Готово! Теперь у вас общий план и список покупок', 'success')
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
                ui.showToast('Вы снова ведёте свой план', 'success')
                await reloadHouseholdData()
                return
           }
           throw new Error('Не удалось создать новую семью')
      }
      
      await pb.collection('users').update(auth.user.id, { household: myOwnHousehold.id })
      
      ui.showToast('Вы снова ведёте свой план', 'success')
      await reloadHouseholdData()
  }

  // Сохраняем сразу (оптимистично), при ошибке возвращаем как было
  const setHiddenMealTypes = async (ids) => {
    const ui = useUIStore()
    const prev = hiddenMealTypes.value
    hiddenMealTypes.value = ids
    try {
      if (!household.value?.id) throw new Error('Семья не найдена')
      const data = await withTimeout(pb.collection('households').update(household.value.id, { hidden_meal_types: ids }), 10000)
      if (data) household.value = data
      return true
    } catch (e) {
      console.error('Ошибка сохранения приёмов пищи:', e)
      hiddenMealTypes.value = prev
      ui.showToast('Не удалось сохранить настройку', 'error')
      return false
    }
  }

  const setWeekendDays = async (days) => {
    const ui = useUIStore()
    const prev = weekendDays.value
    weekendDays.value = days
    try {
      if (!household.value?.id) throw new Error('Семья не найдена')
      const data = await withTimeout(pb.collection('households').update(household.value.id, { weekend_days: days }), 10000)
      if (data) household.value = data
      return true
    } catch (e) {
      console.error('Ошибка сохранения выходных:', e)
      weekendDays.value = prev
      ui.showToast('Не удалось запомнить выходные', 'error')
      return false
    }
  }

  return {
      startDay, periodLength, defaultPortions, hiddenMealTypes, weekendDays,
      household, familyMembers, loading,
      fetchSettings, saveSettings, setHiddenMealTypes, setWeekendDays,
      generateInviteCode, joinHousehold, leaveHousehold,
      removeMember,
      transferOwnership
  }
})
