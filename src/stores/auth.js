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
    
    // Если мы не в Телеграм (обычный браузер) — выходим, покажем экран-заглушку
    if (!telegramStore.initData) {
        console.log('Нет данных Telegram, пропускаем авто-вход')
        loading.value = false
        return
    }

    loading.value = true
    try {
        console.log('🚀 Отправляем данные охраннику (Edge Function)...')
        
        // 1. Вызываем нашу функцию telegram-auth
        const { data, error } = await supabase.functions.invoke('telegram-auth', {
            body: { initData: telegramStore.initData }
        })

        if (error) throw error
        if (!data || !data.session) throw new Error('No session returned')

        // 2. Устанавливаем сессию в Supabase (как будто ввели логин/пароль)
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw sessionError

        console.log('✅ Успешный вход через Telegram!')
        // handleUserSession вызовется автоматически через onAuthStateChange

    } catch (e) {
        console.error('Ошибка входа через Telegram:', e)
        resetState()
    } finally {
        loading.value = false
    }
  }

  // Загрузка данных пользователя после входа
  const handleUserSession = async (authUser) => {
    user.value = authUser
    isAuth.value = true
    
    try {
        // Получаем ID семьи из профиля
        const { data, error } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', authUser.id)
            .single()
            
        if (data && data.household_id) {
            householdId.value = data.household_id
        }
    } catch (e) {
        console.error('Ошибка загрузки профиля:', e)
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
    window.location.reload()
  }

  // Оставим функцию Dev Login на случай, если ты захочешь проверить что-то в браузере
  // Но она больше не основная
  const loginAsTestUser = async () => {
    loading.value = true
    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: 'dev@telegram.mini.app',
            password: 'dev-password-123'
        })
        if (error) {
             // Если юзера нет, создаем (старый код)
             if (error.message.includes('Invalid login')) {
                await supabase.auth.signUp({
                    email: 'dev@telegram.mini.app',
                    password: 'dev-password-123'
                })
             } else throw error
        }
    } catch(e) { console.error(e) } finally { loading.value = false }
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