import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useRealtimeStore } from './realtime' // <-- Импортируем Realtime

export const useSettingsStore = defineStore('settings', () => {
  const startDay = ref(1) 
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  
  const household = ref(null)      
  const familyMembers = ref([])
  const loading = ref(false)
  
  const fetchSettings = async () => {
    const auth = useAuthStore()
    if (!auth.user) return

    loading.value = true
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', auth.user.id)
        .single()

      if (profileError) throw profileError

      if (profile?.household_id) {
          await fetchHouseholdDetails(profile.household_id)
      }
    } catch (e) { 
        console.error('Ошибка загрузки настроек:', e) 
    } finally {
        loading.value = false
    }
  }
  
  const fetchHouseholdDetails = async (householdId) => {
      const { data: hhData, error: hhError } = await supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single()
      
      if (!hhError && hhData) {
          household.value = hhData
          startDay.value = hhData.start_day ?? 1
          periodLength.value = hhData.period_length ?? 7
          defaultPortions.value = hhData.default_portions ?? 1
      }
      
      const { data: members } = await supabase
          .from('profiles')
          .select('id, first_name, username, avatar_url, telegram_id')
          .eq('household_id', householdId)
      
      familyMembers.value = members || []
  }

  // --- ГЛАВНОЕ ИЗМЕНЕНИЕ ЗДЕСЬ ---
  const saveSettings = async (day, period, portions) => {
    // 1. Обновляем у себя локально
    startDay.value = day
    periodLength.value = period
    defaultPortions.value = portions
    
    if (household.value?.id) {
        // 2. Сохраняем в базу данных (чтобы не пропало при перезагрузке)
        const { error } = await supabase
            .from('households')
            .update({ 
                start_day: day, 
                period_length: period, 
                default_portions: portions 
            })
            .eq('id', household.value.id)

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
            defaultPortions: portions
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
      if (!code || code.length < 6) throw new Error('Код должен состоять из 6 цифр')
      const { data: targetHousehold, error } = await supabase
          .from('households')
          .select('id')
          .eq('invite_code', code)
          .single()
      if (error || !targetHousehold) throw new Error('Неверный код или семья не найдена')
      const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: targetHousehold.id })
          .eq('id', auth.user.id)
      if (updateError) throw updateError
      window.location.reload()
  }

  const leaveHousehold = async () => {
      const auth = useAuthStore()
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
                window.location.reload()
                return
           }
           throw new Error('Не удалось создать новую семью')
      }
      await supabase
          .from('profiles')
          .update({ household_id: myOwnHousehold.id })
          .eq('id', auth.user.id)
      window.location.reload()
  }

  return { 
      startDay, periodLength, defaultPortions, 
      household, familyMembers, loading,
      fetchSettings, saveSettings,
      generateInviteCode, joinHousehold, leaveHousehold
  }
})