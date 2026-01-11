import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  const startDay = ref(1) 
  const periodLength = ref(7)
  const settingsId = ref(null)

  const fetchSettings = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('household_id', auth.householdId)
        .limit(1)
        .single()
    
    if (data) {
      startDay.value = data.start_day
      periodLength.value = data.period_length
      settingsId.value = data.id
    } else {
      // Создаем настройки для семьи, если их нет
      await supabase.from('settings').insert([{ 
          start_day: 1, 
          period_length: 7,
          household_id: auth.householdId 
      }])
    }
  }

  const updateSettings = async (newStartDay, newLength) => {
    const auth = useAuthStore()
    startDay.value = newStartDay
    periodLength.value = newLength

    if (settingsId.value) {
      await supabase
        .from('settings')
        .update({ start_day: newStartDay, period_length: newLength })
        .eq('id', settingsId.value)
        .eq('household_id', auth.householdId)
    }
  }

  return { startDay, periodLength, fetchSettings, updateSettings }
})