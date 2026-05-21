import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTelegramStore } from './telegram'
import { useUIStore } from './ui'
import { withTimeout, withRetry, isNetworkError } from '../lib/utils'
import { pb } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)
  const authStatus = ref('idle') // idle, loading, success, error
  const authError = ref(null) // { message, type: 'network'|'auth', canRetry: boolean }

  const ui = useUIStore()

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.ADMIN_EMAIL
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD

  const resetState = () => {
    user.value = null
    householdId.value = null
    isAuth.value = false
  }

  const generateInviteCode = () => {
    return String(Math.floor(100000 + Math.random() * 900000))
  }

  const isInviteCodeNotUnique = (err) => {
    const code = err?.data?.data?.invite_code?.code
    return code === 'validation_not_unique'
  }

  const ensureHouseholdId = async () => {
    if (householdId.value) return householdId.value

    const ownerUserId = pb.authStore.model?.id
    if (!ownerUserId) throw new Error('Пользователь не найден')

    const fromUser = pb.authStore.model?.household
    if (typeof fromUser === 'string' && fromUser) {
      householdId.value = fromUser
      return householdId.value
    }

    let ownedHousehold = null
    try {
      ownedHousehold = await withRetry(async () => {
        return await withTimeout(
          pb.collection('households').getFirstListItem(`owner="${ownerUserId}"`),
          15000
        )
      })
    } catch {
      ownedHousehold = null
    }

    if (ownedHousehold?.id) {
      householdId.value = ownedHousehold.id
      try {
        const updatedUser = await withTimeout(
          pb.collection('users').update(ownerUserId, { household: householdId.value }),
          15000
        )
        user.value = updatedUser
      } catch {}
      return householdId.value
    }

    let created = null
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite_code = generateInviteCode()
        created = await withRetry(async () => {
          return await withTimeout(
            pb.collection('households').create({
              name: 'Моя семья',
              owner: ownerUserId,
              invite_code,
              start_day: 1,
              period_length: 7,
              default_portions: 2
            }),
            15000
          )
        })
        break
      } catch (e) {
        if (isInviteCodeNotUnique(e) && attempt < 4) continue
        throw e
      }
    }

    if (!created?.id) throw new Error('Не удалось создать семью')

    householdId.value = created.id

    try {
      const updatedUser = await withTimeout(
        pb.collection('users').update(ownerUserId, { household: householdId.value }),
        15000
      )
      user.value = updatedUser
    } catch (e) {
      ui.addLog('Не удалось привязать семью к пользователю', 'warn', e)
    }

    return householdId.value
  }

  const handleUserSession = async (authModel) => {
    if (!authModel) return
    user.value = authModel
    try {
      await ensureHouseholdId()
      isAuth.value = true
      authStatus.value = 'success'
    } catch (e) {
      resetState()
      authStatus.value = 'error'
      const isNetwork = isNetworkError(e)
      authError.value = {
        message: isNetwork ? 'Ошибка сети при загрузке данных семьи' : 'Не удалось загрузить данные семьи',
        type: isNetwork ? 'network' : 'auth',
        canRetry: isNetwork
      }
      throw e
    }
  }

  const init = async () => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    
    ui.addLog('Запуск инициализации Auth...', 'info')
    
    try {
        if (pb.authStore.isValid && pb.authStore.model) {
            ui.addLog('Сессия PocketBase найдена при старте', 'info')
            await handleUserSession(pb.authStore.model)
            return
        }

        const telegramStore = useTelegramStore()
        if (telegramStore.initData) {
            ui.addLog('Вход через Telegram не поддерживается в PocketBase версии', 'warn')
        }

        authStatus.value = 'idle'
    } catch (e) {
        ui.addLog('Ошибка инициализации Auth', 'error', e)
        resetState()
        authStatus.value = 'error'
        const isNetwork = isNetworkError(e)
        authError.value = {
            message: isNetwork ? 'Ошибка сети. Попробуйте снова.' : 'Не удалось войти. Проверьте настройки.',
            type: isNetwork ? 'network' : 'auth',
            canRetry: isNetwork
        }
    } finally {
        loading.value = false
    }
  }

  const refreshSession = async () => {
    ui.addLog('🔄 [Refresh] Начало обновления сессии...', 'info')
    try {
        if (!pb.authStore.isValid) return

        await withRetry(async () => {
            return await withTimeout(pb.collection('users').authRefresh(), 10000)
        })

        if (pb.authStore.model) {
            ui.addLog('✅ [Refresh] Сессия обновлена', 'info')
            await handleUserSession(pb.authStore.model)
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
    
    authStatus.value = 'error'
    authError.value = { message: 'Telegram Auth сейчас отключен (PocketBase)', type: 'auth', canRetry: false }
  }

  const signOut = async () => {
    pb.authStore.clear()
    resetState()
  }

  const signIn = async (email, password) => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    try {
        await withRetry(async () => {
            return await withTimeout(pb.collection('users').authWithPassword(email, password), 15000)
        })
        await handleUserSession(pb.authStore.model)
    } catch (e) {
        ui.addLog('Ошибка входа', 'error', e)
        authStatus.value = 'error'
        const isNetwork = isNetworkError(e)
        authError.value = { message: e.message, type: isNetwork ? 'network' : 'auth', canRetry: isNetwork }
        throw e
    } finally {
        loading.value = false
    }
  }

  const signUp = async (email, password) => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    try {
        await withRetry(async () => {
            return await withTimeout(
              pb.collection('users').create({
                email,
                password,
                passwordConfirm: password
              }),
              15000
            )
        })

        await withRetry(async () => {
            return await withTimeout(pb.collection('users').authWithPassword(email, password), 15000)
        })

        await handleUserSession(pb.authStore.model)
    } catch (e) {
        ui.addLog('Ошибка регистрации', 'error', e)
        authStatus.value = 'error'
        const isNetwork = isNetworkError(e)
        authError.value = { message: e.message, type: isNetwork ? 'network' : 'auth', canRetry: isNetwork }
        throw e
    } finally {
        loading.value = false
    }
  }

  const loginAsTestUser = async () => {
    if (import.meta.env.PROD && !import.meta.env.VITE_ENABLE_TEST_USER) {
        alert('Тестовый вход недоступен в PROD')
        return
    }

    try {
        if (!adminEmail || !adminPassword) {
            throw new Error('ADMIN_EMAIL/ADMIN_PASSWORD не заданы в env')
        }
        await signIn(adminEmail, adminPassword)
    } catch (e) { 
        console.error(e)
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
    signIn,
    signUp,
    signOut, 
    handleUserSession
  }
})
