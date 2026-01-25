import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  const startDay = ref(1) 
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  
  const household = ref(null)      
  const familyMembers = ref([])    
  
  const fetchSettings = async () => {
    const auth = useAuthStore()
    if (!auth.user) return

    try {
      // 1. Грузим настройки
      const { data: profile } = await supabase
        .from('profiles')
        .select('start_day, period_length, default_portions, household_id')
        .eq('id', auth.user.id)
        .single()

      if (profile) {
        startDay.value = profile.start_day ?? 1
        periodLength.value = profile.period_length ?? 7
        defaultPortions.value = profile.default_portions ?? 1
        
        if (profile.household_id) {
            await fetchHouseholdDetails(profile.household_id)
        }
      }
    } catch (e) { console.error(e) }
  }
  
  const fetchHouseholdDetails = async (householdId) => {
      const { data: hhData } = await supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single()
      
      household.value = hhData
      
      // Показываем всех, кто СЕЙЧАС подключен к этой семье
      const { data: members } = await supabase
          .from('profiles')
          .select('id, first_name, username, avatar_url, telegram_id')
          .eq('household_id', householdId)
      
      familyMembers.value = members || []
  }

  const saveSettings = async (day, period, portions) => {
    const auth = useAuthStore()
    startDay.value = day
    periodLength.value = period
    defaultPortions.value = portions
    await supabase.from('profiles').update({ 
        start_day: day, 
        period_length: period, 
        default_portions: portions 
    }).eq('id', auth.user.id)
  }

  // --- ЛОГИКА СОВМЕСТНОГО ДОСТУПА ---

  const generateInviteCode = async () => {
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const { data } = await supabase
          .from('households')
          .update({ invite_code: code })
          .eq('id', household.value.id)
          .select()
          .single()
      if (data) household.value = data
  }

  // ВХОД: Переключаемся на чужую семью
  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      
      // 1. Ищем семью
      const { data: targetHousehold, error } = await supabase
          .from('households')
          .select('id')
          .eq('invite_code', code)
          .single()
          
      if (error || !targetHousehold) throw new Error('Неверный код приглашения')

      // 2. Просто меняем ID в профиле. RLS база сама разрешит доступ.
      const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: targetHousehold.id })
          .eq('id', auth.user.id)
          
      if (updateError) throw updateError
      
      // 3. Перезагрузка для обновления данных
      window.location.reload()
  }

  // ВЫХОД: Возвращаемся в родную семью
  const leaveHousehold = async () => {
      const auth = useAuthStore()
      
      // 1. Ищем семью, где я владелец (моя личная семья)
      const { data: myOwnHousehold } = await supabase
          .from('households')
          .select('id')
          .eq('owner_id', auth.user.id)
          .single()
          
      if (!myOwnHousehold) {
          // Если вдруг родной семьи нет (баг) - создаем новую
          alert('Ошибка: Родная семья не найдена. Создаем новую...')
           // Тут можно добавить логику создания, но пока просто вернем ошибку
           return
      }

      // 2. Переключаемся обратно на неё
      await supabase
          .from('profiles')
          .update({ household_id: myOwnHousehold.id })
          .eq('id', auth.user.id)
          
      window.location.reload()
  }

  return { 
      startDay, periodLength, defaultPortions, 
      household, familyMembers,
      fetchSettings, saveSettings,
      generateInviteCode, joinHousehold, leaveHousehold
  }
})