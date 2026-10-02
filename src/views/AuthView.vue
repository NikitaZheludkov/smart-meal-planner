<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { isNetworkError } from '../lib/utils'
import { pb } from '../lib/supabase'
import { useAppConfigStore } from '../stores/appConfig'

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const isLogin = ref(true)
const appConfig = useAppConfigStore()
const showPassword = ref(false)
const showPasswordConfirm = ref(false)

const submitting = ref(false)
const formError = ref('')

// Пока auth.telegramPendingInitData не пуст — Telegram-аккаунт, впервые
// открывший приложение, ещё не привязан ни к одному пользователю (см.
// auth.js). Экран выбора показывается, пока resolvingViaEmail не станет
// true (человек нажал "уже есть аккаунт") — тогда показываем обычную форму,
// а после успешного входа/регистрации Telegram привяжется автоматически.
const resolvingViaEmail = ref(false)
const creatingTelegramAccount = ref(false)
const telegramChoiceError = ref('')

const chooseExistingAccount = () => {
    telegramChoiceError.value = ''
    resolvingViaEmail.value = true
}

const backToTelegramChoice = () => {
    resolvingViaEmail.value = false
    formError.value = ''
}

const createNewTelegramAccount = async () => {
    telegramChoiceError.value = ''
    creatingTelegramAccount.value = true
    try {
        await auth.createTelegramAccount(auth.telegramPendingInitData)
    } catch (e) {
        telegramChoiceError.value = isNetworkError(e)
            ? 'Проблема с подключением. Проверьте интернет и попробуйте снова.'
            : 'Не удалось создать аккаунт. Попробуйте снова.'
    } finally {
        creatingTelegramAccount.value = false
    }
}

// Восстановление пароля email-ссылкой через встроенный механизм PocketBase:
// null — обычная форма входа/регистрации, 'request' — просим email,
// 'sent' — письмо отправлено, показываем подсказку проверить почту.
const recoveryStep = ref(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const switchMode = (login) => {
  if (isLogin.value === login) return
  isLogin.value = login
  formError.value = ''
  passwordConfirm.value = ''
}

const validateForm = () => {
  const trimmedEmail = email.value.trim()
  if (!trimmedEmail) return 'Введите email'
  if (!EMAIL_RE.test(trimmedEmail)) return 'Введите корректный email'
  if (!password.value) return 'Введите пароль'
  if (!isLogin.value) {
    if (password.value.length < 8) return 'Пароль должен быть не короче 8 символов'
    if (password.value !== passwordConfirm.value) return 'Пароли не совпадают'
  }
  return ''
}

const translateAuthError = (e) => {
  if (isNetworkError(e)) {
    return 'Проблема с подключением к интернету. Проверьте сеть и попробуйте снова.'
  }

  const fieldErrors = e?.data?.data || {}
  if (fieldErrors.email?.code === 'validation_not_unique') {
    return 'Этот email уже зарегистрирован. Попробуйте войти.'
  }
  if (fieldErrors.email) {
    return 'Проверьте правильность email.'
  }
  if (fieldErrors.password?.code?.includes('min')) {
    return 'Пароль слишком короткий — минимум 8 символов.'
  }
  if (fieldErrors.password) {
    return 'Проверьте пароль.'
  }

  if (!isLogin.value && e?.status === 400 && /Регистрация/.test(e?.message || '')) {
    return 'Регистрация новых аккаунтов временно закрыта.'
  }

  if (isLogin.value && (e?.status === 400 || e?.status === 401)) {
    return 'Неверный email или пароль.'
  }

  return 'Не удалось выполнить запрос. Попробуйте ещё раз.'
}

const resetAuthErrorState = () => {
  // Ошибки формы показываем инлайн, а не полноэкранным состоянием — тот
  // экран зарезервирован под сбои восстановления сессии при старте.
  if (auth.authStatus === 'error') {
    auth.authStatus = 'idle'
    auth.authError = null
  }
}

const handleSubmit = async () => {
    formError.value = ''
    const validationError = validateForm()
    if (validationError) {
        formError.value = validationError
        return
    }

    submitting.value = true
    try {
        if (isLogin.value) {
            await auth.signIn(email.value.trim(), password.value)
        } else {
            await auth.signUp(email.value.trim(), password.value)
        }
        // Если сюда попали через "уже есть аккаунт" на экране выбора
        // Telegram — привязываем его к только что открытому аккаунту.
        if (resolvingViaEmail.value) {
            await auth.linkPendingTelegram()
        }
    } catch (e) {
        formError.value = translateAuthError(e)
        resetAuthErrorState()
    } finally {
        submitting.value = false
    }
}

const startPasswordRecovery = () => {
    formError.value = ''
    recoveryStep.value = 'request'
}

const cancelPasswordRecovery = () => {
    recoveryStep.value = null
    formError.value = ''
}

const handleRequestPasswordReset = async () => {
    formError.value = ''
    const trimmedEmail = email.value.trim()
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
        formError.value = 'Введите email аккаунта'
        return
    }

    submitting.value = true
    try {
        await pb.collection('users').requestPasswordReset(trimmedEmail)
        recoveryStep.value = 'sent'
    } catch (e) {
        formError.value = isNetworkError(e)
            ? 'Проблема с подключением. Проверьте интернет и попробуйте снова.'
            : 'Не удалось отправить запрос. Попробуйте позже.'
    } finally {
        submitting.value = false
    }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white relative overflow-hidden">

    <div class="absolute -top-20 -right-20 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-0 -left-10 w-72 h-72 bg-blue-50 rounded-full blur-3xl opacity-60"></div>

    <div class="flex-1 flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto text-center z-10">

      <div class="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center mb-6 border border-slate-100 shadow-xl shadow-indigo-100/50 relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-50 to-white"></div>
        <span class="text-5xl relative z-10 animate-bounce-slow">🥗</span>
      </div>

      <h1 class="app-brand mb-2">MealMe</h1>
      <p class="text-slate-400 text-sm font-bold mb-8">
        Добро пожаловать!
      </p>

      <!-- Загрузка при старте приложения (восстановление сессии) -->
      <div v-if="auth.loading && !submitting" class="flex flex-col items-center gap-3">
        <span class="material-icons-round animate-spin text-3xl text-indigo-500">donut_large</span>
        <p class="text-[10px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">Загрузка...</p>
      </div>

      <!-- Ошибка восстановления сессии при старте (не связана с отправкой формы) -->
      <div v-else-if="auth.authStatus === 'error' && !submitting" class="w-full animate-fade-in">
        <div class="bg-red-50 p-4 rounded-2xl border border-red-100 text-red-500 text-xs font-bold mb-4">
            <div class="flex items-center justify-center gap-2 mb-2">
                <span class="material-icons-round text-lg">
                    {{ auth.authError?.type === 'network' ? 'wifi_off' : 'error_outline' }}
                </span>
                <span>{{ auth.authError?.message || 'Ошибка входа' }}</span>
            </div>
            <p v-if="auth.authError?.type === 'network'" class="opacity-70 font-normal">
                Проверьте соединение и попробуйте снова.
            </p>
        </div>

        <button
            @click="auth.authError?.type === 'network' ? auth.init() : (auth.authStatus = 'idle')"
            class="w-full py-3 bg-slate-900 text-white rounded-xl shadow-lg active:scale-95 transition-transform font-bold text-sm"
        >
            {{ auth.authError?.type === 'network' ? 'Попробовать снова' : 'Вернуться назад' }}
        </button>
      </div>

      <!-- Telegram открыт впервые: не создаём аккаунт молча, спрашиваем явно -->
      <div v-else-if="auth.telegramPendingInitData && !resolvingViaEmail" class="w-full animate-fade-in">
        <div class="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4 text-left">
          <div class="text-center">
            <span class="material-icons-round text-3xl text-indigo-400">help_outline</span>
            <h3 class="text-sm font-black text-slate-900 mt-2">Уже есть аккаунт?</h3>
            <p class="text-xs text-slate-400 font-bold leading-snug mt-1">
              Этот Telegram открывает MealMe впервые. Если вы уже регистрировались по email — войдите, чтобы не потерять свои данные, и мы привяжем к аккаунту этот Telegram.
            </p>
          </div>

          <div v-if="telegramChoiceError" class="bg-red-50 text-red-500 text-xs font-bold px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2">
            <span class="material-icons-round text-base shrink-0">error_outline</span>
            <span>{{ telegramChoiceError }}</span>
          </div>

          <button
            type="button"
            @click="chooseExistingAccount"
            class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform"
          >
            У меня уже есть аккаунт — войти по email
          </button>

          <button
            type="button"
            @click="createNewTelegramAccount"
            :disabled="creatingTelegramAccount"
            class="w-full py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span v-if="creatingTelegramAccount" class="material-icons-round animate-spin text-lg">donut_large</span>
            <span>Впервые здесь — создать аккаунт</span>
          </button>
        </div>
      </div>

      <!-- Форма входа/регистрации -->
      <div v-else class="w-full space-y-4">
        <form v-if="recoveryStep === null" @submit.prevent="handleSubmit" class="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4">
            <div v-if="auth.telegramPendingInitData && resolvingViaEmail" class="flex items-center gap-2 -mb-1">
              <button type="button" @click="backToTelegramChoice" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <span class="material-icons-round text-lg">arrow_back</span>
              </button>
              <p class="text-[10px] text-slate-400 font-bold leading-snug">Войдите или зарегистрируйтесь — Telegram привяжется автоматически</p>
            </div>

            <div class="flex bg-slate-100 p-1 rounded-xl mb-2">
                <button
                    type="button"
                    @click="switchMode(true)"
                    class="flex-1 py-2 text-xs font-bold rounded-lg transition-colors"
                    :class="isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                >Вход</button>
                <button
                    type="button"
                    @click="switchMode(false)"
                    class="flex-1 py-2 text-xs font-bold rounded-lg transition-colors"
                    :class="!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                >Регистрация</button>
            </div>

            <div v-if="!isLogin && !appConfig.registrationOpen" class="text-xs text-secondary text-center bg-slate-50 rounded-xl px-4 py-3 mb-1">
                Регистрация новых аккаунтов сейчас закрыта. Войти можно в уже существующий аккаунт.
            </div>

            <div class="space-y-3 text-left">
                <div>
                  <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Email</label>
                  <input
                    v-model="email"
                    type="email"
                    autocomplete="email"
                    placeholder="your@email.com"
                    autofocus
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                  >
                </div>
                <div>
                  <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Пароль</label>
                  <div class="relative">
                    <input
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      :autocomplete="isLogin ? 'current-password' : 'new-password'"
                      placeholder="••••••••"
                      class="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                    >
                    <button
                      type="button"
                      @click="showPassword = !showPassword"
                      tabindex="-1"
                      class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
                    >
                      <span class="material-icons-round text-lg">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                  <div v-if="isLogin" class="text-right mt-1">
                    <button
                      type="button"
                      @click="startPasswordRecovery"
                      class="text-[10px] font-bold text-indigo-500 hover:text-indigo-600"
                    >
                      Забыли пароль?
                    </button>
                  </div>
                </div>

                <transition name="fade-slide">
                  <div v-if="!isLogin">
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Повторите пароль</label>
                    <div class="relative">
                      <input
                        v-model="passwordConfirm"
                        :type="showPasswordConfirm ? 'text' : 'password'"
                        autocomplete="new-password"
                        placeholder="••••••••"
                        class="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                      >
                      <button
                        type="button"
                        @click="showPasswordConfirm = !showPasswordConfirm"
                        tabindex="-1"
                        class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
                      >
                        <span class="material-icons-round text-lg">{{ showPasswordConfirm ? 'visibility_off' : 'visibility' }}</span>
                      </button>
                    </div>
                  </div>
                </transition>
            </div>

            <div v-if="formError" class="bg-red-50 text-red-500 text-xs font-bold px-4 py-3 rounded-xl border border-red-100 text-left flex items-start gap-2 animate-fade-in">
              <span class="material-icons-round text-base shrink-0">error_outline</span>
              <span>{{ formError }}</span>
            </div>

            <button
                type="submit"
                :disabled="submitting"
                class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
            >
                <span v-if="submitting" class="material-icons-round animate-spin text-lg">donut_large</span>
                <span>{{ isLogin ? 'Войти' : 'Создать аккаунт' }}</span>
            </button>
        </form>

        <!-- Восстановление, шаг 1: запрашиваем email для ссылки сброса пароля -->
        <form v-else-if="recoveryStep === 'request'" @submit.prevent="handleRequestPasswordReset" class="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4 text-left">
            <div class="flex items-center gap-2">
              <button type="button" @click="cancelPasswordRecovery" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <span class="material-icons-round text-lg">arrow_back</span>
              </button>
              <h3 class="text-sm font-black text-slate-900">Восстановление пароля</h3>
            </div>

            <p class="text-xs text-slate-400 font-bold leading-snug">
              Введите email, который вы указывали при регистрации — пришлём на него ссылку для сброса пароля.
              Регистрировались через Telegram и не задавали email? Откройте приложение через бота — там в Настройках можно задать email и пароль.
            </p>

            <div>
              <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Email</label>
              <input
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="your@email.com"
                autofocus
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
              >
            </div>

            <div v-if="formError" class="bg-red-50 text-red-500 text-xs font-bold px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2 animate-fade-in">
              <span class="material-icons-round text-base shrink-0">error_outline</span>
              <span>{{ formError }}</span>
            </div>

            <button
                type="submit"
                :disabled="submitting"
                class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
            >
                <span v-if="submitting" class="material-icons-round animate-spin text-lg">donut_large</span>
                <span>Отправить ссылку на email</span>
            </button>
        </form>

        <!-- Восстановление, шаг 2: письмо отправлено -->
        <div v-else class="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4 text-left">
            <div class="flex items-center gap-2">
              <button type="button" @click="cancelPasswordRecovery" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <span class="material-icons-round text-lg">arrow_back</span>
              </button>
              <h3 class="text-sm font-black text-slate-900">Проверьте почту</h3>
            </div>

            <p class="text-xs text-slate-400 font-bold leading-snug">
              Если такой аккаунт существует, на <span class="text-slate-700">{{ email.trim() }}</span> отправлено письмо со ссылкой для сброса пароля. Перейдите по ней, чтобы задать новый пароль.
            </p>

            <button
                type="button"
                @click="cancelPasswordRecovery"
                class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform"
            >
                Вернуться ко входу
            </button>
        </div>

      </div>

    </div>

    <div class="p-6 text-center z-10">
        <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
            MealMe Cloud • v1.1
        </p>
    </div>
  </div>
</template>

<style scoped>
.animate-bounce-slow { animation: bounce 3s infinite; }
@keyframes bounce {
  0%, 100% { transform: translateY(-5%); }
  50% { transform: translateY(5%); }
}
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
