import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) 
  const householdId = ref(null) 
  const loading = ref(true) // Состояние глобальной загрузки
  const isAuth = ref(false) 
  
  // Флаг: мы в режиме разработки? (Vite сам это определяет)
  const isDev = import.meta.env.DEV 

  // --- 1. ИНИЦИАЛИЗАЦИЯ (SPLASH SCREEN) ---
  const initApp = async () => {
    loading.value = true
    
    // Проверяем среду
    const tg = window.Telegram?.WebApp
    
    // Сценарий А: Мы внутри Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      console.log('📱 TMA detected. Auto-login.')
      await loginWithUser(tg.initDataUnsafe.user)
    } 
    // Сценарий Б: Мы в браузере
    else {
      console.log('💻 Web detected. Waiting for user interaction.')
      loading.value = false // Убираем загрузку, показываем Лендинг
    }
  }

  // --- 2. ЛОГИКА ВХОДА / РЕГИСТРАЦИИ ---
  const loginWithUser = async (tgUser) => {
    loading.value = true
    user.value = tgUser

    try {
      // Ищем профиль
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_id', tgUser.id)
        .maybeSingle()

      if (error) throw error

      // АВТО-РЕГИСТРАЦИЯ (ЕСЛИ НЕТ ПРОФИЛЯ)
      if (!profile) {
        console.log('✨ New user! Registering...')
        
        // 1. Создаем пространство
        const { data: newHouse, error: hError } = await supabase
          .from('households')
          .insert([{ 
             name: 'Мое пространство', 
             invite_code: Math.random().toString(36).substring(2, 7).toUpperCase() 
          }])
          .select()
          .single()
        
        if (hError) throw hError

        // 2. Создаем профиль
        const { data: newProfile, error: pError } = await supabase
          .from('profiles')
          .insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            username: tgUser.username,
            household_id: newHouse.id
          }])
          .select()
          .single()

        if (pError) throw pError
        profile = newProfile
      }

      // Успех
      householdId.value = profile.household_id
      isAuth.value = true

    } catch (e) {
      console.error('Login Failed:', e)
      alert('Ошибка входа: ' + e.message)
      isAuth.value = false
    } finally {
      loading.value = false
    }
  }

  // --- 3. DEV TOOLS (ВХОД ДЛЯ РАЗРАБОТЧИКА) ---
  const devLogin = async (customId) => {
    if (!isDev) return // Защита: в продакшене не сработает
    
    const fakeUser = {
      id: customId,
      first_name: customId === 777 ? 'Administrator' : `Tester ${customId}`,
      username: 'dev_mode'
    }
    await loginWithUser(fakeUser)
  }

  // --- 4. СМЕНА СЕМЬИ ---
  const joinHousehold = async (code) => {
    const { data: house } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', code.toUpperCase())
      .single()
      
    if (!house) throw new Error('Код не найден')

    const { error } = await supabase
      .from('profiles')
      .update({ household_id: house.id })
      .eq('telegram_id', user.value.id)

    if (error) throw error
    location.reload()
  }

  const getInviteCode = async () => {
    if (!householdId.value) return '...'
    const { data } = await supabase
        .from('households')
        .select('invite_code')
        .eq('id', householdId.value)
        .single()
    return data?.invite_code
  }

  return { 
    user, 
    householdId, 
    isAuth, 
    loading, 
    isDev, // Экспортируем флаг разработки
    initApp, 
    loginWithUser, 
    devLogin, 
    joinHousehold, 
    getInviteCode 
  }
})