import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useRealtimeStore } from './realtime' // <-- Импортируем Realtime
import { useUIStore } from './ui'

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
      // Если householdId уже известен из auth, используем его сразу
      const hhId = auth.householdId
      if (hhId) {
        await fetchHouseholdDetails(hhId)
      } else {
        const { data: profile, error: profileError } = await withTimeout(
          supabase
          .from('profiles')
          .select('household_id')
          .eq('id', auth.user.id)
          .single(),
          20000
        )
        if (profileError) throw profileError
        if (profile?.household_id) {
            await fetchHouseholdDetails(profile.household_id)
        }
      }
    } catch (e) { 
        console.error('Ошибка загрузки настроек:', e) 
        ui.addLog('Ошибка загрузки настроек', 'error', e)
    } finally {
        loading.value = false
    }
  }
  
  const fetchHouseholdDetails = async (householdId) => {
      const { data: hhData, error: hhError } = await withTimeout(
          supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single(),
          20000
      )
      
      if (!hhError && hhData) {
          household.value = hhData
          startDay.value = Number(hhData.start_day ?? 1)
          periodLength.value = Number(hhData.period_length ?? 7)
          defaultPortions.value = Number(hhData.default_portions ?? 1)
          const ui = useUIStore()
          ui.addLog('Настройки семьи загружены')
      }
      
      const { data: members } = await supabase
          .from('profiles')
          .select('id, first_name, username, avatar_url, telegram_id')
          .eq('household_id', householdId)
      
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
        const { error } = await withTimeout(
            supabase
            .from('households')
            .update({ 
                start_day: day, 
                period_length: period, 
                default_portions: portions 
            })
            .eq('id', household.value.id),
            5000
        )

        if (error) {
            console.error('Ошибка сохранения настроек:', error)
            return
        }

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
      const { data, error } = await supabase
          .from('households')
          .update({ invite_code: code })
          .eq('id', household.value.id)
          .select()
          .single()
      if (error) throw error
      if (data) household.value = data 
  }

  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      const ui = useUIStore() // <-- Нужно добавить импорт
      if (!code || code.length < 6) {
          alert('Код должен состоять из 6 цифр')
          throw new Error('Неверный код')
      }
      
      const { data: targetHousehold, error } = await supabase
          .from('households')
          .select('id')
          .eq('invite_code', code)
          .single()
      
      if (error || !targetHousehold) {
          alert('Семья с таким кодом не найдена')
          throw new Error('Неверный код')
      }

      const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: targetHousehold.id })
          .eq('id', auth.user.id)
      
      if (updateError) throw updateError
      
      alert('Вы присоединились к семье!')
      
      // Даем пользователю прочитать сообщение перед перезагрузкой
      setTimeout(() => {
          window.location.reload()
      }, 1500)
  }

  const leaveHousehold = async () => {
      const auth = useAuthStore()
      const ui = useUIStore()
      
      const { data: myOwnHousehold } = await supabase
          .from('households')
          .select('id')
          .eq('owner_id', auth.user.id)
          .single()

      if (!myOwnHousehold) {
          const { data: newHousehold } = await supabase
              .from('households')
              .insert({ name: 'Моя семья', owner_id: auth.user.id })
              .select()
              .single()
           if (newHousehold) {
                await supabase.from('profiles').update({ household_id: newHousehold.id }).eq('id', auth.user.id)
                alert('Создана новая семья')
                setTimeout(() => window.location.reload(), 1000)
                return
           }
           throw new Error('Не удалось создать новую семью')
      }
      
      await supabase
          .from('profiles')
          .update({ household_id: myOwnHousehold.id })
          .eq('id', auth.user.id)
      
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
