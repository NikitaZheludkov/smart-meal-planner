import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useTelegramStore } from './telegram'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)

  const withTimeout = async (promise, ms = 10000) => { // Увеличим таймаут по умолчанию
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  // Инициализация
  const init = async () => {
    loading.value = true
    
    try {
        // 1. Проверяем текущую сессию
        const { data: { session } } = await withTimeout(supabase.auth.getSession())
        
        if (session?.user) {
            await handleUserSession(session.user)
        } else {
            // 2. Если сессии нет, пробуем авто-вход через Telegram
            await loginWithTelegram()
        }
        
        // 3. Слушаем изменения (разлогин/смена юзера)
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('AuthStateChange event:', event)
            if (session?.user) {
                await handleUserSession(session.user)
            } else {
                resetState()
            }
            loading.value = false
        })
        
    } catch (e) {
        console.error('Ошибка инициализации Auth:', e)
        resetState()
    } finally {
        loading.value = false
    }
  }

  const loginWithTelegram = async () => {
    const telegramStore = useTelegramStore()
    
    if (!telegramStore.initData) {
        console.log('Запущен в браузере. Авто-вход через TG пропущен.')
        return
    }

    try {
        console.log('Вызов функции telegram-auth...')
        const { data, error } = await withTimeout(
          supabase.functions.invoke('telegram-auth', { body: { initData: telegramStore.initData } })
        )

        if (error) throw new Error(`Function invoke error: ${error.message}`)
        if (!data || !data.session) throw new Error('No session returned from function')

        console.log('Установка сессии...')
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw new Error(`Set session error: ${sessionError.message}`)

        console.log('Получение пользователя...')
        const { data: userData, error: userError } = await withTimeout(supabase.auth.getUser())
        if (userError) throw new Error(`Get user error: ${userError.message}`)
        if (!userData?.user) throw new Error('User not found after setting session')
        
        console.log('Успешная авторизация, обработка сессии...')
        await handleUserSession(userData.user)

    } catch (e) {
        console.error('Auth Error:', e.message)
    }
  }

  const handleUserSession = async (authUser) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', authUser.id)
            .single()
            
        if (error || !data) {
            console.warn('Профиль не найден. Требуется повторная регистрация.')
            await signOut()
            return
        }

        user.value = authUser
        householdId.value = data.household_id
        isAuth.value = true
        
    } catch (e) {
        console.error('Session Error:', e)
        await signOut()
    }
  }

  const resetState = () => {
    user.value = null
    householdId.value = null
    isAuth.value = false
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    resetState()
  }

  const loginAsTestUser = async () => {
    loading.value = true
    try {
        // Попытка входа
        const { error } = await supabase.auth.signInWithPassword({
            email: 'dev@telegram.mini.app',
            password: 'dev-password-123'
        })
        
        if (error) {
             console.error('Ошибка Dev входа:', error)
             alert('Ошибка входа Dev User. Проверьте консоль.')
        }
    } catch(e) { 
        console.error(e)
    } finally { 
        loading.value = false 
    }
  }

  return { 
    user, 
    householdId, 
    isAuth, 
    loading, 
    init, 
    loginWithTelegram,
    loginAsTestUser,
    signOut,
    handleUserSession
  }
})
