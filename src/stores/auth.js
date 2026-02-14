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
  const authStatus = ref('idle') // idle, loading, success, error
  const authError = ref(null) // { message, type: 'network'|'auth', canRetry: boolean }

  const ui = useUIStore()

  const isNetworkError = (err) => {
    return err.name === 'TimeoutError' || 
           err.message?.includes('fetch') || 
           err.message?.includes('Abort') ||
           err.message?.includes('Load failed') ||
           err.message?.includes('Failed to fetch')
  }

  const withTimeout = async (promise, ms = 45000) => { // Увеличил с 20000 до 45000
    const t = new Promise((_, reject) => setTimeout(() => {
        const err = new Error('timeout')
        err.name = 'TimeoutError'
        reject(err)
    }, ms))
    return Promise.race([promise, t])
  }

  const withRetry = async (fn, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn()
      } catch (err) {
        const isLastRetry = i === retries - 1
        const networkErr = isNetworkError(err)
        
        if (isLastRetry || !networkErr) throw err
        
        ui.addLog(`Retry ${i + 1}/${retries} after error: ${err.message}`, 'warn')
        await new Promise(r => setTimeout(r, delay * (i + 1))) // Экспоненциальная задержка
      }
    }
  }

  // Инициализация
  const init = async () => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    
    ui.addLog('Запуск инициализации Auth...', 'info')
    
    // Тест связи с Supabase
    try {
      const start = Date.now()
      // Добавляем жесткий таймаут 5 секунд для проверки связи
      await withTimeout(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`),
          5000
      )
      ui.addLog(`Связь с Auth API ок (${Date.now() - start}ms)`)
    } catch (e) {
      ui.addLog('Нет связи с Auth API (возможна блокировка)', 'warn', e.message)
      authStatus.value = 'error'
      authError.value = {
          message: 'Сервер недоступен. Проверьте интернет или включите VPN.',
          type: 'network',
          canRetry: true
      }
      loading.value = false
      return // ПРЕКРАЩАЕМ ИНИЦИАЛИЗАЦИЮ
    }

    try {
        // 1. Проверяем текущую сессию
        const { data: { session }, error } = await withTimeout(supabase.auth.getSession())
        
        if (error) {
            ui.addLog('Ошибка getSession при старте', 'error', error)
            if (isNetworkError(error)) {
                authStatus.value = 'error'
                authError.value = { 
                    message: 'Нет связи с сервером. Проверьте интернет.', 
                    type: 'network', 
                    canRetry: true 
                }
                return
            }
        }
        
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
        authStatus.value = 'idle'
        return
    }
    
    authStatus.value = 'loading'
    authError.value = null

    try {
        ui.addLog('Вызов Edge Function telegram-auth...')
        ui.addLog('InitData length: ' + (telegramStore.initData?.length || 0))
        
        // Оборачиваем весь процесс в withRetry
        const { data, error } = await withRetry(async () => {
            // 1. Попытка через стандартный SDK
            ui.addLog('Попытка SDK invoke...')
            let response = await withTimeout(
            supabase.functions.invoke('telegram-auth', { 
                body: { initData: telegramStore.initData }
            }),
            15000
            ).catch(err => ({ error: err }))

            // 2. Если SDK не сработал, пробуем прямой fetch (иногда SDK глючит с Edge Functions)
            if (response.error) {
                ui.addLog('SDK invoke не удался, пробуем прямой fetch...', 'warn', response.error.message)
                
                const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-auth`
                
                const fetchResponse = await withTimeout(
                    fetch(functionUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                        },
                        body: JSON.stringify({ initData: telegramStore.initData })
                    }),
                    15000
                ).catch(err => {
                    ui.addLog('Прямой fetch тоже не удался', 'error', err.message)
                    throw err
                })

                if (!fetchResponse.ok) {
                    const errText = await fetchResponse.text()
                    ui.addLog('Ошибка прямого fetch: ' + fetchResponse.status, 'error', errText)
                    throw new Error(`Direct fetch error: ${fetchResponse.status}`)
                }

                const directData = await fetchResponse.json()
                response = { data: directData, error: null }
            }
            
            return response
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
        authStatus.value = 'error'
        
        const isNetwork = isNetworkError(e)
        authError.value = {
            message: isNetwork ? 'Ошибка сети. Попробуйте снова.' : 'Не удалось войти. Перезапустите приложение.',
            type: isNetwork ? 'network' : 'auth',
            canRetry: isNetwork
        }
    }
  }

  const handleUserSession = async (authUser) => {
    if (!authUser) return
    
    // Предотвращаем множественные одновременные загрузки профиля
    if (user.value?.id === authUser.id && isAuth.value) {
        if (!householdId.value) {
            ui.addLog('Профиль загружен, но householdId отсутствует. Повторная загрузка...', 'warn')
        } else {
            ui.addLog(`Профиль уже загружен. Household: ${householdId.value}`, 'info')
            authStatus.value = 'success'
            return
        }
    }

    try {
        ui.addLog('Загрузка профиля из БД для: ' + authUser.id)
        
        const { data, error } = await withRetry(async () => {
            return await withTimeout(
                supabase
                    .from('profiles')
                    .select('household_id')
                    .eq('id', authUser.id)
                    .single(),
                15000
            )
        })
            
        if (error) {
            ui.addLog('Ошибка загрузки профиля', 'error', error)
            if (error.code === 'PGRST116') {
                ui.addLog('Профиль не найден в базе', 'warn')
                authStatus.value = 'error'
                authError.value = { message: 'Профиль не найден', type: 'auth', canRetry: false }
            }
            // При сетевых ошибках НЕ выходим из аккаунта, просто ждем
            const isTransient = isNetworkError(error)
            
            if (isTransient) {
                ui.addLog('Временная ошибка сети, сессия сохранена', 'warn')
                authStatus.value = 'error'
                authError.value = { message: 'Ошибка сети при загрузке профиля', type: 'network', canRetry: true }
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
        authStatus.value = 'success'
        
    } catch (e) {
        ui.addLog('Исключение в handleUserSession', 'error', e)
        authStatus.value = 'error'
        authError.value = { message: 'Ошибка приложения', type: 'auth', canRetry: false }
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
    authStatus,
    authError,
    init, 
    refreshSession, 
    loginWithTelegram, 
    loginAsTestUser, 
    signOut, 
    handleUserSession, 
    withRetry, 
    withTimeout 
  }
})
