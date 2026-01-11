import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) 
  const householdId = ref(null) 
  const loading = ref(true)
  const isAuth = ref(false) 
  
  // Флаг режима разработки
  const isDev = import.meta.env.DEV 

  // --- 1. ИНИЦИАЛИЗАЦИЯ ---
  const initApp = async () => {
    loading.value = true
    const tg = window.Telegram?.WebApp
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      console.log('📱 TMA detected. Auto-login.')
      await loginWithUser(tg.initDataUnsafe.user)
    } else {
      loading.value = false
    }
  }

  // --- 2. ЛОГИКА ВХОДА ---
  const loginWithUser = async (tgUser) => {
    loading.value = true
    user.value = tgUser

    try {
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_id', tgUser.id)
        .maybeSingle()

      if (error) throw error

      if (!profile) {
        // Регистрация нового
        const { data: newHouse, error: hError } = await supabase
          .from('households')
          .insert([{ 
             name: 'Мое пространство', 
             invite_code: Math.random().toString(36).substring(2, 7).toUpperCase() 
          }])
          .select().single()
        
        if (hError) throw hError

        const { data: newProfile, error: pError } = await supabase
          .from('profiles')
          .insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            username: tgUser.username,
            household_id: newHouse.id
          }])
          .select().single()

        if (pError) throw pError
        profile = newProfile
      }

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

  // --- 3. ВХОД ДЛЯ АДМИНА (Кнопка) ---
  // 👇 ВОТ ФУНКЦИЯ, КОТОРОЙ НЕ ХВАТАЛО 👇
  const loginAsAdmin = async () => {
    await loginWithUser({
      id: 777000,
      first_name: 'Super Admin',
      username: 'admin_sys'
    })
  }

  // --- 4. DEV LOGIN (Для панели) ---
  const devLogin = async (customId) => {
    await loginWithUser({
      id: customId,
      first_name: `User ${customId}`,
      username: 'dev_mode'
    })
  }

  // --- 5. СМЕНА СЕМЬИ ---
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

  // Обязательно возвращаем loginAsAdmin, чтобы кнопка её видела
  return { 
    user, householdId, isAuth, loading, isDev, 
    initApp, loginWithUser, loginAsAdmin, devLogin, joinHousehold, getInviteCode 
  }
})