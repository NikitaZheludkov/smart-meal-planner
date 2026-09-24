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
  // initData Telegram-аккаунта, который впервые открыл приложение и ещё не
  // связан ни с одним пользователем. Не создаём аккаунт молча — ждём, пока
  // AuthView не спросит "уже есть аккаунт?" и не получит ответ пользователя.
  const telegramPendingInitData = ref(null)
  // Показать один раз сразу после регистрации по email: без привязанного
  // Telegram у такого аккаунта нет ни одного способа восстановить пароль
  // (SMTP не настроен) — пользователь должен узнать об этом сразу, а не
  // когда реально забудет пароль.
  const showTelegramLinkPrompt = ref(false)

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
        // withTimeout не отменяет сам запрос — если предыдущая попытка в
        // этом цикле "протухла" по таймауту, но на сервере всё же успешно
        // создалась (а withRetry её повторил), у нас может уже быть семья.
        // Перепроверяем перед каждой попыткой create(), чтобы не наплодить
        // дубликаты вместо того, чтобы просто подхватить уже созданную.
        if (attempt > 0) {
          const maybeExisting = await pb
            .collection('households')
            .getFirstListItem(`owner="${ownerUserId}"`)
            .catch(() => null)
          if (maybeExisting?.id) {
            created = maybeExisting
            break
          }
        }

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

  const signInWithTelegram = async (initData) => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    try {
        const res = await withRetry(async () => {
            return await withTimeout(
              pb.send('/api/telegram-auth', { method: 'POST', body: { initData } }),
              15000
            )
        })

        if (res?.status === 'not_found') {
            // Этот Telegram-аккаунт ещё ни с кем не связан. НЕ создаём
            // нового пользователя молча — иначе человек, у которого уже
            // есть email-аккаунт, попадёт в новый пустой и решит, что
            // потерял все данные. AuthView должен спросить явно.
            telegramPendingInitData.value = initData
            authStatus.value = 'idle'
            return
        }

        pb.authStore.save(res.token, res.record)
        await handleUserSession(pb.authStore.model)
    } catch (e) {
        ui.addLog('Ошибка входа через Telegram', 'error', e)
        authStatus.value = 'error'
        const isNetwork = isNetworkError(e)
        authError.value = {
          message: isNetwork ? 'Ошибка сети при входе через Telegram' : 'Не удалось войти через Telegram',
          type: isNetwork ? 'network' : 'auth',
          canRetry: isNetwork
        }
        throw e
    } finally {
        loading.value = false
    }
  }

  // Пользователь на экране выбора подтвердил, что аккаунта раньше не было —
  // теперь можно создать новый Telegram-аккаунт по той же initData.
  const createTelegramAccount = async (initData) => {
    loading.value = true
    authStatus.value = 'loading'
    authError.value = null
    try {
        const res = await withRetry(async () => {
            return await withTimeout(
              pb.send('/api/telegram-auth', { method: 'POST', body: { initData, createIfMissing: true } }),
              15000
            )
        })
        pb.authStore.save(res.token, res.record)
        await handleUserSession(pb.authStore.model)
        telegramPendingInitData.value = null
    } catch (e) {
        ui.addLog('Не удалось создать аккаунт через Telegram', 'error', e)
        authStatus.value = 'error'
        const isNetwork = isNetworkError(e)
        authError.value = {
          message: isNetwork ? 'Ошибка сети при создании аккаунта' : 'Не удалось создать аккаунт',
          type: isNetwork ? 'network' : 'auth',
          canRetry: isNetwork
        }
        throw e
    } finally {
        loading.value = false
    }
  }

  // Вызывается после того, как пользователь на экране выбора нажал "уже
  // есть аккаунт" и успешно вошёл/зарегистрировался по email — привязывает
  // тот самый Telegram, из-за которого возник выбор. Молча логирует неудачу:
  // пользователь уже авторизован своим email/паролем, блокировать его из-за
  // сбоя привязки не нужно, привязать можно и позже вручную в Настройках.
  const linkPendingTelegram = async () => {
    if (!telegramPendingInitData.value) return
    const initData = telegramPendingInitData.value
    telegramPendingInitData.value = null
    try {
        await linkTelegram(initData)
    } catch (e) {
        ui.addLog('Не удалось автоматически привязать Telegram после входа по email', 'warn', e)
    }
  }

  const clearTelegramPending = () => {
    telegramPendingInitData.value = null
  }

  // Привязывает Telegram-аккаунт (по initData из открытого внутри Telegram
  // Mini App) к УЖЕ вошедшему пользователю — а не логинит заново.
  // pb.send сам подставит Authorization из текущей сессии, а сервер по его
  // наличию отличает "привязать" от "войти/зарегистрироваться" в одном и
  // том же /api/telegram-auth (см. pb_hooks/main.pb.js).
  const linkTelegram = async (initData) => {
    await withRetry(async () => {
        return await withTimeout(
          pb.send('/api/telegram-auth', { method: 'POST', body: { initData } }),
          15000
        )
    })
    await handleUserSession(pb.authStore.model)
  }

  // Восстановление пароля через бота — код приходит в Telegram вместо
  // email-ссылки, что не зависит от настройки SMTP на сервере.
  const requestTelegramRecovery = async (email) => {
    return await withRetry(async () => {
        return await withTimeout(
          pb.send('/api/telegram-recovery/request', { method: 'POST', body: { email } }),
          15000
        )
    })
  }

  const confirmTelegramRecovery = async (email, code, password, passwordConfirm) => {
    return await withRetry(async () => {
        return await withTimeout(
          pb.send('/api/telegram-recovery/confirm', { method: 'POST', body: { email, code, password, passwordConfirm } }),
          15000
        )
    })
  }

  // Задаёт настоящие email и пароль Telegram-аккаунту (был tg_<id>@telegram.local
  // со случайным паролем) — запасной способ входа и обязательное условие для
  // восстановления пароля через бота.
  const setEmailPassword = async (email, password, passwordConfirm) => {
    // Смена пароля на сервере тут же обнуляет текущий токен (перевыпуск
    // tokenKey), поэтому эндпоинт сразу возвращает новый — используем его,
    // а не пытаемся обновить сессию по уже недействительному старому токену.
    const res = await withRetry(async () => {
        return await withTimeout(
          pb.send('/api/set-email-password', { method: 'POST', body: { email, password, passwordConfirm } }),
          15000
        )
    })
    pb.authStore.save(res.token, res.record)
    await handleUserSession(pb.authStore.model)
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
        showTelegramLinkPrompt.value = true
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

  const dismissTelegramLinkPrompt = () => {
    showTelegramLinkPrompt.value = false
  }

  return {
    user,
    householdId,
    isAuth,
    loading,
    authStatus,
    authError,
    telegramPendingInitData,
    showTelegramLinkPrompt,
    dismissTelegramLinkPrompt,
    init,
    refreshSession,
    signIn,
    signUp,
    signInWithTelegram,
    createTelegramAccount,
    linkPendingTelegram,
    clearTelegramPending,
    linkTelegram,
    requestTelegramRecovery,
    confirmTelegramRecovery,
    setEmailPassword,
    signOut,
    handleUserSession
  }
})
