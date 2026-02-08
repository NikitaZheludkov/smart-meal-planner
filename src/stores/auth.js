import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useTelegramStore } from './telegram'
import { useUIStore } from './ui'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)

  const ui = useUIStore()

  const withTimeout = async (promise, ms = 15000) => { // Увеличим еще больше для мобильных сетей
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  // Инициализация
  const init = async () => {
    loading.value = true
    ui.addLog('Запуск инициализации Auth...', 'info')
    
    // Тест связи с Supabase
    try {
      const start = Date.now()
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`)
      ui.addLog(`Связь с Auth API ок (${Date.now() - start}ms)`)
    } catch (e) {
      ui.addLog('Нет связи с Auth API (возможна блокировка)', 'warn', e.message)
    }

    try {
        // 1. Проверяем текущую сессию
        const { data: { session }, error } = await withTimeout(supabase.auth.getSession())
        if (error) ui.addLog('Ошибка getSession при старте', 'error', error)
        
        if (session?.user) {
            ui.addLog('Сессия найдена при старте, юзер: ' + session.user.id)
            await handleUserSession(session.user)
        } else {
            ui.addLog('Сессия не найдена при старте, пробуем TG вход')
            await loginWithTelegram()
        }
        
        // 3. Слушаем изменения
        supabase.auth.onAuthStateChange(async (event, session) => {
            ui.addLog('AuthStateChange event: ' + event)
            if (session?.user) {
                await handleUserSession(session.user)
            } else {
                if (event === 'SIGNED_OUT') resetState()
            }
            loading.value = false
        })
        
    } catch (e) {
        ui.addLog('Ошибка инициализации Auth', 'error', e)
        resetState()
    } finally {
        loading.value = false
    }
  }

  // Метод для принудительного обновления сессии (помогает при выходе из сна)
  const refreshSession = async () => {
    ui.addLog('🔄 [Refresh] Начало обновления сессии...', 'info')
    try {
        const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 10000)
        if (error) {
            ui.addLog('❌ [Refresh] Ошибка getSession', 'error', error)
            throw error
        }
        
        if (session?.user) {
            ui.addLog('✅ [Refresh] Сессия активна: ' + session.user.id)
            await handleUserSession(session.user)
        } else {
            ui.addLog('ℹ️ [Refresh] Сессия не найдена, восстанавливаем...')
            await loginWithTelegram()
        }
    } catch (e) {
        ui.addLog('❌ [Refresh] Критическая ошибка', 'error', e)
    }
  }

  const loginWithTelegram = async () => {
    const telegramStore = useTelegramStore()
    
    if (!telegramStore.initData) {
        ui.addLog('Авто-вход через TG пропущен (не в TMA)')
        return
    }

    try {
        ui.addLog('Вызов Edge Function telegram-auth...')
        ui.addLog('InitData length: ' + (telegramStore.initData?.length || 0))
        
        // Пытаемся вызвать функцию
        const { data, error } = await withTimeout(
          supabase.functions.invoke('telegram-auth', { 
            body: { initData: telegramStore.initData },
            headers: { 'X-Debug-Mode': 'true' }
          }),
          20000
        ).catch(err => {
          ui.addLog('Низкоуровневая ошибка fetch функции', 'error', {
            name: err.name,
            message: err.message,
            cause: err.cause
          })
          throw err
        })

        if (error) {
          ui.addLog('Edge Function вернула ошибку', 'error', error)
          throw new Error(`Function invoke error: ${error.message}`)
        }
        if (!data || !data.session) throw new Error('No session returned from function')

        ui.addLog('Установка полученной сессии...')
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw new Error(`Set session error: ${sessionError.message}`)

        ui.addLog('Получение данных пользователя...')
        const { data: userData, error: userError } = await withTimeout(supabase.auth.getUser())
        if (userError) throw new Error(`Get user error: ${userError.message}`)
        if (!userData?.user) throw new Error('User not found after setting session')
        
        ui.addLog('Успешный вход через TG, загрузка профиля...')
        await handleUserSession(userData.user)

    } catch (e) {
        ui.addLog('Ошибка входа через Telegram', 'error', { message: e.message, stack: e.stack })
    }
  }

  const handleUserSession = async (authUser) => {
    try {
        ui.addLog('Загрузка профиля из БД для: ' + authUser.id)
        const { data, error } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', authUser.id)
            .single()
            
        if (error) {
            ui.addLog('Ошибка загрузки профиля', 'error', error)
            if (error.code === 'PGRST116') {
                ui.addLog('Профиль не найден в базе', 'warn')
            }
            if (error.message === 'Load failed' || error.message?.includes('fetch')) {
                ui.addLog('Сетевая ошибка при загрузке профиля', 'warn')
                return 
            }
            await signOut()
            return
        }

        if (!data) {
            ui.addLog('Данные профиля пусты', 'warn')
            await signOut()
            return
        }

        ui.addLog('Профиль загружен, householdId: ' + data.household_id)
        user.value = authUser
        householdId.value = data.household_id
        isAuth.value = true
        
    } catch (e) {
        ui.addLog('Исключение в handleUserSession', 'error', e)
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
    refreshSession,
    loginWithTelegram,
    loginAsTestUser,
    signOut,
    handleUserSession
  }
})
