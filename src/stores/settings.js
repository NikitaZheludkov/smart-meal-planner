import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  // Настройки теперь общие для семьи
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
      // 1. Узнаем ID семьи пользователя из профиля
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', auth.user.id)
        .single()

      if (profileError) throw profileError

      if (profile?.household_id) {
          // 2. Загружаем данные СЕМЬИ (включая настройки)
          await fetchHouseholdDetails(profile.household_id)
      }
    } catch (e) { 
        console.error('Ошибка загрузки настроек:', e) 
    } finally {
        loading.value = false
    }
  }
  
  const fetchHouseholdDetails = async (householdId) => {
      // Данные семьи + НАСТРОЙКИ
      const { data: hhData, error: hhError } = await supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single()
      
      if (!hhError && hhData) {
          household.value = hhData
          // Применяем настройки из базы в приложение
          startDay.value = hhData.start_day ?? 1
          periodLength.value = hhData.period_length ?? 7
          defaultPortions.value = hhData.default_portions ?? 1
      }
      
      // Участники семьи
      const { data: members } = await supabase
          .from('profiles')
          .select('id, first_name, username, avatar_url, telegram_id')
          .eq('household_id', householdId)
      
      familyMembers.value = members || []
  }

  // Сохранение настроек (ОБНОВЛЕНО: пишет в households)
  const saveSettings = async (day, period, portions) => {
    // 1. Мгновенно обновляем локальный стейт (Optimistic UI)
    startDay.value = day
    periodLength.value = period
    defaultPortions.value = portions
    
    // 2. Если есть семья, сохраняем в базу
    if (household.value?.id) {
        const { error } = await supabase
            .from('households')
            .update({ 
                start_day: day, 
                period_length: period, 
                default_portions: portions 
            })
            .eq('id', household.value.id)

        if (error) console.error('Ошибка сохранения настроек:', error)
    }
  }

  // --- ЛОГИКА СОВМЕСТНОГО ДОСТУПА ---

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
      if (data) household.value = data // Обновляем локально, чтобы отобразить код
  }

  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      
      if (!code || code.length < 6) throw new Error('Код должен состоять из 6 цифр')

      // 1. Ищем семью по коду
      const { data: targetHousehold, error } = await supabase
          .from('households')
          .select('id')
          .eq('invite_code', code)
          .single()
          
      if (error || !targetHousehold) throw new Error('Неверный код или семья не найдена')

      // 2. Меняем ID в профиле пользователя
      const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: targetHousehold.id })
          .eq('id', auth.user.id)
          
      if (updateError) throw updateError
      
      // 3. Перезагрузка для применения изменений
      window.location.reload()
  }

  const leaveHousehold = async () => {
      const auth = useAuthStore()
      
      // 1. Ищем "родную" семью (где пользователь владелец)
      const { data: myOwnHousehold } = await supabase
          .from('households')
          .select('id')
          .eq('owner_id', auth.user.id)
          .single()
          
      if (!myOwnHousehold) {
          // Если своей семьи нет, создаем новую
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

      // 2. Переключаемся на родную семью
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