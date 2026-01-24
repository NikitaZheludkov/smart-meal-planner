import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  // Настройки отображения
  const startDay = ref(1) 
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  
  // Данные семьи
  const household = ref(null)      // Информация о семье (id, invite_code)
  const familyMembers = ref([])    // Список участников
  
  // --- ЗАГРУЗКА ---
  const fetchSettings = async () => {
    const auth = useAuthStore()
    if (!auth.user) return

    try {
      // 1. Грузим настройки профиля
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('start_day, period_length, default_portions, household_id')
        .eq('id', auth.user.id)
        .single()

      if (error) throw error

      if (profile) {
        if (profile.start_day !== null) startDay.value = profile.start_day
        if (profile.period_length !== null) periodLength.value = profile.period_length
        if (profile.default_portions !== null) defaultPortions.value = profile.default_portions
        
        // 2. Если есть семья - грузим её данные
        if (profile.household_id) {
            await fetchHouseholdDetails(profile.household_id)
        }
      }
    } catch (e) {
      console.error('Ошибка настроек:', e)
    }
  }
  
  // Загрузка деталей семьи и участников
  const fetchHouseholdDetails = async (householdId) => {
      // Инфо о семье (код приглашения)
      const { data: hhData } = await supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single()
      
      household.value = hhData
      
      // Участники
      const { data: members } = await supabase
          .from('profiles')
          .select('id, first_name, username, avatar_url, telegram_id')
          .eq('household_id', householdId)
      
      familyMembers.value = members || []
  }

  // --- СОХРАНЕНИЕ НАСТРОЕК ---
  const saveSettings = async (day, period, portions) => {
    const auth = useAuthStore()
    if (!auth.user) return

    const updates = { start_day: day, period_length: period, default_portions: portions }
    
    // Оптимистичное обновление
    startDay.value = day
    periodLength.value = period
    defaultPortions.value = portions

    await supabase.from('profiles').update(updates).eq('id', auth.user.id)
  }

  // --- УПРАВЛЕНИЕ СЕМЬЕЙ ---

  // 1. Сгенерировать код приглашения (Только владелец)
  const generateInviteCode = async () => {
      // Генерируем 6 цифр
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      
      const { data, error } = await supabase
          .from('households')
          .update({ invite_code: code })
          .eq('id', household.value.id)
          .select()
          .single()
          
      if (data) household.value = data
      return error
  }

  // 2. Войти в семью по коду
  const joinHousehold = async (code) => {
      const auth = useAuthStore()
      
      // Ищем семью с таким кодом
      const { data: targetHousehold, error: findError } = await supabase
          .from('households')
          .select('id')
          .eq('invite_code', code)
          .single()
          
      if (findError || !targetHousehold) throw new Error('Неверный код')

      // Обновляем профиль пользователя
      const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: targetHousehold.id })
          .eq('id', auth.user.id)
          
      if (updateError) throw updateError
      
      // Перезагружаем страницу, чтобы подтянулись новые данные (план, продукты)
      window.location.reload()
  }

  // 3. Покинуть семью (вернуться в личную)
  const leaveHousehold = async () => {
      const auth = useAuthStore()
      
      // Мы просто создаем новую семью через тот же механизм, что при регистрации
      // Но так как у нас нет готовой функции "reset household", 
      // мы сделаем хитро: вызовем Edge Function или просто создадим новую запись
      
      // Простой вариант: Создаем новую семью и переезжаем в нее
      const { data: newHousehold } = await supabase
          .from('households')
          .insert({ name: 'Моя семья', owner_id: auth.user.id })
          .select()
          .single()
          
      if (newHousehold) {
          await supabase
              .from('profiles')
              .update({ household_id: newHousehold.id })
              .eq('id', auth.user.id)
          
          window.location.reload()
      }
  }

  return { 
      startDay, periodLength, defaultPortions, 
      household, familyMembers,
      fetchSettings, saveSettings,
      generateInviteCode, joinHousehold, leaveHousehold
  }
})