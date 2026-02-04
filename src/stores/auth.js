import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useTelegramStore } from './telegram'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)

  const withTimeout = async (promise, ms) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  // Инициализация
  const init = async () => {
    loading.value = true
    
    try {
        // 1. Проверяем текущую сессию
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000)
        
        if (session?.user) {
            await handleUserSession(session.user)
        } else {
            // 2. Если сессии нет, пробуем авто-вход через Telegram
            await loginWithTelegram()
        }
        
        // 3. Слушаем изменения (разлогин/смена юзера)
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                await handleUserSession(session.user)
            } else {
                resetState()
            }
            // Всегда выключаем загрузку при изменении состояния
            loading.value = false
        })
        
    } catch (e) {
        console.error('Ошибка инициализации Auth:', e)
        // В случае любой ошибки - сбрасываем всё, чтобы показать экран входа
        resetState()
    } finally {
        // ГАРАНТИЯ: Загрузка выключается всегда
        loading.value = false
    }
  }

  const loginWithTelegram = async () => {
    const telegramStore = useTelegramStore()
    
    // Если мы не в Телеграм (обычный браузер)
    if (!telegramStore.initData) {
        console.log('Запущен в браузере. Авто-вход через TG пропущен.')
        return
    }

    try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('telegram-auth', { body: { initData: telegramStore.initData } }),
          7000
        )

        if (error) throw error
        if (!data || !data.session) throw new Error('No session returned')

        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw sessionError

    } catch (e) {
        console.error('Auth Error:', e)
        // Не сбрасываем state здесь, просто выходим. Пользователь увидит кнопку "Войти".
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
