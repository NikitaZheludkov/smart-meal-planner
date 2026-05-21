import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import { useRealtimeStore } from './realtime' // <-- Импортируем Realtime
import { useUIStore } from './ui'
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
          filter: `household="${householdId}"`
      })

      familyMembers.value = members || []
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
      if (!code || code.length < 6) {
          alert('Код должен состоять из 6 цифр')
          throw new Error('Неверный код')
      }
      
      const targetHousehold = await pb.collection('households').getFirstListItem(`invite_code="${code}"`, { fields: 'id' })
      
      if (!targetHousehold) {
          alert('Семья с таким кодом не найдена')
          throw new Error('Неверный код')
      }

      if (!auth.user?.id) throw new Error('Пользователь не найден')
      const updatedUser = await pb.collection('users').update(auth.user.id, { household: targetHousehold.id })
      auth.user = updatedUser
      auth.householdId = targetHousehold.id
      
      alert('Вы присоединились к семье!')
      
      // Даем пользователю прочитать сообщение перед перезагрузкой
      setTimeout(() => {
          window.location.reload()
      }, 1500)
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
                const updatedUser = await pb.collection('users').update(auth.user.id, { household: newHousehold.id })
                auth.user = updatedUser
                auth.householdId = newHousehold.id
                alert('Создана новая семья')
                setTimeout(() => window.location.reload(), 1000)
                return
           }
           throw new Error('Не удалось создать новую семью')
      }
      
      const updatedUser = await pb.collection('users').update(auth.user.id, { household: myOwnHousehold.id })
      auth.user = updatedUser
      auth.householdId = myOwnHousehold.id
      
      alert('Вы вернулись в свою семью')
      setTimeout(() => window.location.reload(), 1000)
  }

  return { 
      startDay, periodLength, defaultPortions, 
      household, familyMembers, loading,
      fetchSettings, saveSettings,
      generateInviteCode, joinHousehold, leaveHousehold
  }
})
