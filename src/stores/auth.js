import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  const getDefaultUsernameFromEmail = (email) => {
    const e = (email || '').toString().trim().toLowerCase()
    if (!e.includes('@')) return ''
    const local = e.split('@')[0].trim()
    return local || ''
  }

  const ensurePublicUsername = async () => {
    const model = pb.authStore.model
    const userId = model?.id
    if (!userId) return

    const username = (model?.username || '').toString().trim()
    if (username) return

    const email = (model?.email || '').toString().trim()
    const nextUsername = getDefaultUsernameFromEmail(email)
    if (!nextUsername) return

    try {
      const updatedUser = await withRetry(async () => {
        return await withTimeout(pb.collection('users').update(userId, { username: nextUsername }), 15000)
      })
      user.value = updatedUser
    } catch (e) {
      ui.addLog('Не удалось автоматически заполнить username', 'warn', e)
    }
  }

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
      await ensurePublicUsername()
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
        const username = getDefaultUsernameFromEmail(email)
        await withRetry(async () => {
            return await withTimeout(
              pb.collection('users').create(
                username
                  ? { email, username, password, passwordConfirm: password }
                  : { email, password, passwordConfirm: password }
              ),
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

  return { 
    user, 
    householdId, 
    isAuth, 
    loading,
    authStatus,
    authError,
    init, 
    refreshSession, 
    signIn,
    signUp,
    signOut, 
    handleUserSession
  }
})
