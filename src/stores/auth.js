import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useTelegramStore } from './telegram'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)

  // Инициализация (проверка текущей сессии при перезагрузке)
  const init = async () => {
    loading.value = true
    
    // Проверяем, есть ли активная сессия в LocalStorage
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session?.user) {
      await handleUserSession(session.user)
    } else {
      // Если сессии нет - пробуем войти через Telegram (если мы внутри ТГ)
      await loginWithTelegram()
    }
    
    // Слушаем изменения (вдруг разлогинится)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await handleUserSession(session.user)
      } else {
        resetState()
      }
      loading.value = false
    })
    
    loading.value = false
  }

  // Главная функция входа через Telegram
  const loginWithTelegram = async () => {
    const telegramStore = useTelegramStore()
    
    // Если мы не в Телеграм (обычный браузер) — выходим
    if (!telegramStore.initData) {
        loading.value = false
        return
    }

    loading.value = true
    try {
        // 1. Вызываем нашу функцию telegram-auth
        const { data, error } = await supabase.functions.invoke('telegram-auth', {
            body: { initData: telegramStore.initData }
        })

        if (error) throw error
        if (!data || !data.session) throw new Error('No session returned')

        // 2. Устанавливаем сессию
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw sessionError

    } catch (e) {
        console.error('Ошибка входа через Telegram:', e)
        resetState()
    } finally {
        loading.value = false
    }
  }

  // Загрузка данных пользователя после входа
  const handleUserSession = async (authUser) => {
    try {
        // Пробуем получить профиль
        const { data, error } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', authUser.id)
            .single()
            
        // ВАЖНОЕ ИЗМЕНЕНИЕ:
        // Если профиля нет (error) — значит база была сброшена, а юзер остался.
        // Нужно принудительно разлогинить его, чтобы он зарегистрировался заново.
        if (error || !data) {
            console.warn('Профиль пользователя не найден (возможно, база была очищена). Выход...')
            await signOut()
            return
        }

        // Если все ок — сохраняем данные
        user.value = authUser
        householdId.value = data.household_id
        isAuth.value = true
        
    } catch (e) {
        console.error('Критическая ошибка сессии:', e)
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
    // Не делаем reload, чтобы не зациклить, если что-то пойдет не так
  }

  const loginAsTestUser = async () => {
    loading.value = true
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: 'dev@telegram.mini.app',
            password: 'dev-password-123'
        })
        
        if (error) {
             // Если юзера нет, создаем
             if (error.message.includes('Invalid login')) {
                // Создаем юзера. Благодаря триггеру в БД профиль создастся сам.
                const { error: signUpError } = await supabase.auth.signUp({
                    email: 'dev@telegram.mini.app',
                    password: 'dev-password-123',
                    options: {
                        data: {
                            first_name: 'Dev User',
                            username: 'developer'
                        }
                    }
                })
                if (signUpError) throw signUpError
             } else throw error
        }
    } catch(e) { 
        console.error(e)
        alert('Ошибка входа: ' + e.message)
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
    signOut
  }
})