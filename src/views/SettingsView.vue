<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'
import { useAppConfigStore } from '../stores/appConfig'
import AdminPanel from '../components/AdminPanel.vue'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const platform = usePlatformStore()
const ui = useUIStore()
const appConfig = useAppConfigStore()
const showAdminPanel = ref(false)

const selectedStartDay = ref(1)
const selectedPeriod = ref(7)
const selectedPortions = ref(1)

// Инициализация
onMounted(async () => {
    await settingsStore.fetchSettings()
    selectedStartDay.value = settingsStore.startDay
    selectedPeriod.value = settingsStore.periodLength
    selectedPortions.value = settingsStore.defaultPortions
})

// --- ЛОГИКА СЕМЬИ ---
const showJoinModal = ref(false)
const modalRegistryId = `settings-join-${Math.random().toString(36).slice(2)}`

watch(showJoinModal, (newVal) => {
    ui.syncModalState(modalRegistryId, newVal)
})

onUnmounted(() => {
    ui.clearModalState(modalRegistryId)
})
const joinCodeInput = ref('')
const isGenerating = ref(false)
const isJoining = ref(false)

const isOwner = computed(() => {
    if (!settingsStore.household || !authStore.user) return false
    return settingsStore.household.owner === authStore.user.id
})

// Хелпер: Получить инициалы (Никита -> Н, Ivan Ivanov -> II)
const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Хелпер: Определить, это я или нет
const isMe = (memberId) => {
    return authStore.user && memberId === authStore.user.id
}

const handleRemoveMember = async (member) => {
    if (!member?.id) return
    if (!isOwner.value) return
    if (member.id === settingsStore.household?.owner) return

    const label = member.displayName || member.email || member.username || 'участника'
    const ok = await ui.confirm(`Исключить ${label} из семьи?`, { okText: 'Исключить', cancelText: 'Отмена' })
    if (!ok) return

    try {
        await settingsStore.removeMember(member.id)
    } catch (e) {
        ui.showToast(e?.message || 'Не удалось исключить участника', 'error')
    }
}

const handleMakeOwner = async (member) => {
    if (!isOwner.value) return
    if (!member?.id) return
    if (member.id === settingsStore.household?.owner) return

    const label = member.displayName || member.email || member.username || 'этого участника'
    const ok = await ui.confirm('Передать права владельца этому пользователю? Вы станете обычным участником.', { okText: 'Передать', cancelText: 'Отмена' })
    if (!ok) return

    try {
        await settingsStore.transferOwnership(member.id)
    } catch (e) {
        ui.showToast(e?.message || 'Не удалось передать права', 'error')
    }
}

const handleGenerateCode = async () => {
    if (isGenerating.value) return
    isGenerating.value = true
    platform.haptic.impact('medium')
    try {
        await settingsStore.generateInviteCode()
    } catch (e) {
        ui.showToast(e.message || 'Не удалось сгенерировать код', 'error')
    } finally {
        isGenerating.value = false
    }
}

const copyCode = async () => {
    if (settingsStore.household?.invite_code) {
        const ok = await platform.copyText(settingsStore.household.invite_code)
        if (ok) {
            platform.haptic.notification('success')
            ui.showToast('Код скопирован', 'success')
        } else {
            platform.haptic.notification('error')
            ui.showToast('Не удалось скопировать код', 'error')
        }
    }
}

const handleJoin = async () => {
    if (!joinCodeInput.value) {
        ui.showToast('Введите код', 'warn')
        return
    }
    
    isJoining.value = true
    platform.haptic.notification('success')
    
    try {
        await settingsStore.joinHousehold(joinCodeInput.value)
    } catch (e) {
        platform.haptic.notification('error')
        ui.showToast(e?.message ? `Ошибка: ${e.message}` : 'Ошибка при вступлении в семью', 'error')
        isJoining.value = false
    }
}

const handleLeave = async () => {
    platform.haptic.notification('warning')
    if (settingsStore.familyMembers.length <= 1) {
        ui.showToast('Вы единственный участник семьи', 'warn')
        return
    }
    if (isOwner.value) {
        ui.showToast('Сначала передайте права владельца другому участнику', 'warn')
        return
    }
    if (await ui.confirm('Вы точно хотите покинуть эту семью? Вы вернетесь к своим личным данным.', { okText: 'Покинуть', cancelText: 'Отмена' })) {
        try {
            await settingsStore.leaveHousehold()
        } catch (e) {
            ui.showToast(e.message || 'Не удалось покинуть семью', 'error')
        }
    }
}

const handleSave = async () => {
    try {
        platform.haptic.notification('success')
        // Force period to 7 days
        await settingsStore.saveSettings(selectedStartDay.value, 7, selectedPortions.value)
        ui.showToast('Настройки сохранены', 'success')
    } catch (e) {
        console.error('Settings save error:', e)
        platform.haptic.notification('error')
        ui.showToast(e.message || 'Не удалось сохранить настройки. Проверьте соединение.', 'error')
    }
}

// --- ПРИВЯЗКА TELEGRAM ---
// Реальный initData доступен только внутри самого Mini App — привязать
// можно лишь открыв Настройки через бота, а не с обычного сайта.
const isInsideTelegram = !!window.Telegram?.WebApp?.initData
const isTelegramLinked = computed(() => !!authStore.user?.telegram_id)
const telegramBotLink = import.meta.env.VITE_TELEGRAM_BOT_LINK
const linkingTelegram = ref(false)

const handleLinkTelegram = async () => {
    const initData = window.Telegram?.WebApp?.initData
    if (!initData) return

    linkingTelegram.value = true
    try {
        await authStore.linkTelegram(initData)
        platform.haptic.notification('success')
        ui.showToast('Telegram привязан', 'success')
    } catch (e) {
        platform.haptic.notification('error')
        ui.showToast(e.message || 'Не удалось привязать Telegram', 'error')
    } finally {
        linkingTelegram.value = false
    }
}

// --- EMAIL И ПАРОЛЬ ДЛЯ TELEGRAM-АККАУНТОВ ---
// У аккаунтов, созданных через Telegram, email синтетический
// (tg_<id>@telegram.local), а пароль — случайная строка, которую
// пользователь никогда не видел. Это единственный признак такого аккаунта,
// который нужен клиенту: сервер (см. /api/set-email-password) перепроверяет
// то же самое перед сохранением, так что подделать это на клиенте бессмысленно.
const hasTelegramOnlyAccount = computed(() => /^tg_\d+@telegram\.local$/.test(authStore.user?.email || ''))
const showEmailPasswordForm = ref(false)
const newEmail = ref('')
const newPassword = ref('')
const newPasswordConfirm = ref('')
const showNewPassword = ref(false)
const savingEmailPassword = ref(false)
const emailPasswordError = ref('')

const handleSetEmailPassword = async () => {
    emailPasswordError.value = ''
    const trimmedEmail = newEmail.value.trim()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        emailPasswordError.value = 'Введите корректный email'
        return
    }
    if (newPassword.value.length < 8) {
        emailPasswordError.value = 'Пароль должен быть не короче 8 символов'
        return
    }
    if (newPassword.value !== newPasswordConfirm.value) {
        emailPasswordError.value = 'Пароли не совпадают'
        return
    }

    savingEmailPassword.value = true
    try {
        await authStore.setEmailPassword(trimmedEmail, newPassword.value, newPasswordConfirm.value)
        platform.haptic.notification('success')
        ui.showToast('Email и пароль добавлены', 'success')
        showEmailPasswordForm.value = false
        newEmail.value = ''
        newPassword.value = ''
        newPasswordConfirm.value = ''
    } catch (e) {
        emailPasswordError.value = e.message || 'Не удалось сохранить. Попробуйте ещё раз.'
    } finally {
        savingEmailPassword.value = false
    }
}

const handleLogout = async () => {
    platform.haptic.impact('medium')
    if (await ui.confirm('Выйти из аккаунта?', { okText: 'Выйти', cancelText: 'Отмена' })) {
        await authStore.signOut()
        window.location.reload()
    }
}

const weekDays = [
  { val: 1, label: 'Понедельник' }, { val: 2, label: 'Вторник' }, { val: 3, label: 'Среда' },
  { val: 4, label: 'Четверг' }, { val: 5, label: 'Пятница' }, { val: 6, label: 'Суббота' }, { val: 0, label: 'Воскресенье' }
]
const periods = [
  { val: 3, label: '3 дня' }, { val: 7, label: 'Неделя (7 дней)' }, { val: 14, label: '2 Недели' }
]
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h1 class="app-title mb-0">Настройки</h1>
        <button 
          @click="handleSave" 
          class="btn-primary shadow-lg tap-effect text-[11px] py-2 px-4"
        >
          Сохранить
        </button>
      </div>

      <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
              {{ getInitials(authStore.user?.first_name || authStore.user?.username || authStore.user?.email) }}
          </div>
          <p class="text-sm font-bold text-slate-500 truncate">
              {{ authStore.user?.first_name || authStore.user?.username || authStore.user?.email?.split('@')[0] || 'Пользователь' }}
          </p>
      </div>
    </div>

    <div class="flex-1 px-5 py-4 space-y-6 overflow-y-auto pb-app-nav">
      
      <div>
        <h3 class="card-title text-sm ml-2 mb-2">Моя Семья</h3>
        
        <div v-if="settingsStore.loading" class="text-center py-6">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
        </div>

        <div v-else class="bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 space-y-4">
            
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-[10px] font-normal text-secondary">Вы находитесь в:</div>
                    <div class="text-lg card-title leading-tight">
                        {{ settingsStore.household?.name || 'Загрузка......' }}
                    </div>
                </div>
                <div v-if="isOwner" class="bg-amber-100 text-amber-600 px-2 py-1 rounded-lg text-[10px] font-bold">
                    👑 Владелец
                </div>
            </div>

            <div class="space-y-2">
                <div v-for="member in settingsStore.familyMembers" :key="member.id" class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                         :class="isMe(member.id) ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'">
                        {{ getInitials(member.first_name || member.username) }}
                    </div>
                    
                    <div class="flex-1 min-w-0">
                        <div class="card-title text-sm truncate">
                            {{ member.displayName || member.first_name || member.username || member.email }}
                            <span v-if="isMe(member.id)" class="text-indigo-500 ml-1">(Вы)</span>
                        </div>
                        <div class="text-[10px] font-normal text-secondary">
                            {{ member.id === settingsStore.household?.owner ? 'Администратор' : 'Участник' }}
                        </div>
                        <div v-if="isMe(member.id) && member.email" class="text-[10px] font-bold text-slate-300 truncate">
                            {{ member.email }}
                        </div>
                    </div>

                    <div v-if="isOwner && member.id !== settingsStore.household?.owner" class="flex flex-col items-end gap-1 shrink-0">
                        <button
                            @click="handleMakeOwner(member)"
                            class="px-3 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 font-black text-[10px] tap-effect"
                        >
                            Сделать владельцем
                        </button>
                        <button
                            @click="handleRemoveMember(member)"
                            class="px-3 py-2 rounded-full bg-red-50 text-red-500 hover:bg-red-100 font-black text-[10px] tap-effect"
                        >
                            Исключить
                        </button>
                    </div>
                </div>
            </div>

            <div class="h-[1px] bg-slate-50 w-full"></div>

            <div v-if="isOwner || settingsStore.household?.invite_code">
                <div v-if="settingsStore.household?.invite_code">
                    <div class="text-[10px] font-bold text-slate-400 mb-1 text-center">Код для приглашения</div>
                    
                    <button @click="copyCode" class="w-full bg-slate-900 rounded-[20px] p-4 relative overflow-hidden group tap-effect active:scale-95 transition-transform mb-2">
                        <div class="text-3xl font-black text-white tracking-[0.2em] text-center font-mono">
                            {{ settingsStore.household.invite_code }}
                        </div>
                        <div class="text-[9px] text-slate-400 text-center mt-1 font-bold">
                            Нажми, чтобы скопировать
                        </div>
                    </button>

                    <button v-if="isOwner" @click="handleGenerateCode" class="w-full text-xs font-bold text-slate-400 py-2 hover:text-slate-600 transition-colors">
                        {{ isGenerating ? 'Обновляем...' : 'Сгенерировать новый код' }}
                    </button>
                </div>
                
                <button 
                    v-else-if="isOwner" 
                    @click="handleGenerateCode"
                    class="btn-primary w-full text-xs shadow-lg"
                >
                    {{ isGenerating ? 'Создаем' : 'Получить код доступа' }}
                </button>

                <button 
                    @click="showJoinModal = true"
                    class="btn-secondary w-full mt-2 text-xs"
                >
                    Вступить в другую семью
                </button>
            </div>

            <div v-else-if="!isOwner && !settingsStore.household?.invite_code && settingsStore.familyMembers.length > 1">
                 <button 
                    @click="handleLeave"
                    class="w-full py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-full font-bold text-xs tap-effect flex items-center justify-center gap-2"
                >
                    <span class="material-icons-round text-sm">logout</span>
                    Покинуть семью
                </button>
            </div>

        </div>
      </div>

      <div>
        <h3 class="card-title text-sm ml-2 mb-2">Предпочтения</h3>
        <div class="bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 space-y-3">
          <div class="flex items-center justify-between">
            <span class="card-title text-sm">Начало недели</span>
            <select v-model="selectedStartDay" class="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none">
              <option v-for="day in weekDays" :key="day.val" :value="day.val">{{ day.label }}</option>
            </select>
          </div>

          <div class="flex items-center justify-between gap-3">
            <div>
              <span class="card-title text-sm block">Порции (по умолч.)</span>
              <span class="text-[10px] font-bold text-slate-400 leading-snug block mt-0.5">Сколько порций добавляется в план при выборе блюда на приём пищи. Можно поправить прямо в плане позже.</span>
            </div>
            <div class="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1 shrink-0">
                <button @click="selectedPortions = Math.max(1, selectedPortions - 1)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">
                  <span class="material-icons-round text-sm">remove</span>
                </button>
                <span class="w-8 text-center font-black text-slate-800 text-sm">{{ selectedPortions }}</span>
                 <button @click="selectedPortions++" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">
                  <span class="material-icons-round text-sm">add</span>
                 </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 class="card-title text-sm ml-2 mb-2">Telegram</h3>
        <div class="bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">
          <div v-if="isTelegramLinked" class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <span class="material-icons-round text-xl">check_circle</span>
            </div>
            <div>
              <div class="text-sm font-black text-slate-900">Telegram привязан</div>
              <div class="text-[10px] font-bold text-slate-400">Восстановление пароля работает через бота</div>
            </div>
          </div>

          <div v-else-if="isInsideTelegram" class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-black text-slate-900">Привязать Telegram</div>
              <div class="text-[10px] font-bold text-slate-400">Понадобится, чтобы восстанавливать пароль через бота</div>
            </div>
            <button
              @click="handleLinkTelegram"
              :disabled="linkingTelegram"
              class="btn-primary shadow-lg tap-effect text-[11px] py-2 px-4 shrink-0 disabled:opacity-60"
            >
              {{ linkingTelegram ? '...' : 'Привязать' }}
            </button>
          </div>

          <div v-else class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                <span class="material-icons-round text-xl">link_off</span>
              </div>
              <div>
                <div class="text-sm font-black text-slate-900">Telegram не привязан</div>
                <div class="text-[10px] font-bold text-slate-400">Нужен для восстановления пароля</div>
              </div>
            </div>
            <a
              v-if="telegramBotLink"
              :href="telegramBotLink"
              target="_blank"
              class="btn-primary shadow-lg tap-effect text-[11px] py-2 px-4 shrink-0"
            >
              Открыть
            </a>
          </div>
        </div>
      </div>

      <div v-if="hasTelegramOnlyAccount">
        <h3 class="card-title text-sm ml-2 mb-2">Email и пароль</h3>
        <div class="bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">
          <div v-if="!showEmailPasswordForm" class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-black text-slate-900">Не заданы</div>
              <div class="text-[10px] font-bold text-slate-400 leading-snug">Запасной способ входа, если Telegram станет недоступен, и вход с компьютера без бота</div>
            </div>
            <button
              @click="showEmailPasswordForm = true"
              class="btn-primary shadow-lg tap-effect text-[11px] py-2 px-4 shrink-0"
            >
              Добавить
            </button>
          </div>

          <form v-else @submit.prevent="handleSetEmailPassword" class="space-y-3 text-left">
            <div>
              <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Email</label>
              <input
                v-model="newEmail"
                type="email"
                autocomplete="email"
                placeholder="your@email.com"
                autofocus
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none"
              >
            </div>
            <div>
              <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Пароль</label>
              <div class="relative">
                <input
                  v-model="newPassword"
                  :type="showNewPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="••••••••"
                  class="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none"
                >
                <button type="button" @click="showNewPassword = !showNewPassword" tabindex="-1" class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400">
                  <span class="material-icons-round text-lg">{{ showNewPassword ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
            </div>
            <div>
              <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Повторите пароль</label>
              <input
                v-model="newPasswordConfirm"
                :type="showNewPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="••••••••"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none"
              >
            </div>

            <div v-if="emailPasswordError" class="bg-red-50 text-red-500 text-xs font-bold px-4 py-3 rounded-xl border border-red-100">
              {{ emailPasswordError }}
            </div>

            <div class="flex gap-2">
              <button type="button" @click="showEmailPasswordForm = false" class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">
                Отмена
              </button>
              <button type="submit" :disabled="savingEmailPassword" class="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                <span v-if="savingEmailPassword" class="material-icons-round animate-spin text-base">donut_large</span>
                <span>Сохранить</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="appConfig.isAdmin">
        <button
          @click="showAdminPanel = true; platform.haptic.impact('light')"
          class="w-full bg-white px-4 py-3.5 rounded-[20px] border border-slate-100 flex items-center gap-3 tap-effect text-left"
        >
          <span class="material-icons-round text-xl text-slate-900">admin_panel_settings</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Администрирование</span>
            <span class="block text-[11px] text-secondary">Статистика, справочники и настройки приложения</span>
          </span>
          <span class="material-icons-round text-lg text-slate-300">chevron_right</span>
        </button>
      </div>

      <div>
        <button
          @click="handleLogout"
          class="w-full bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 flex items-center justify-center gap-2 tap-effect text-slate-900 font-bold text-sm"
        >
             <span class="material-icons-round">logout</span>
             <span>Выйти из аккаунта</span>
        </button>
      </div>

    </div>

    

    <AdminPanel :is-open="showAdminPanel" @close="showAdminPanel = false" />

    <Transition name="modal">
    <div v-if="showJoinModal" class="fixed inset-0 z-[70] flex flex-col justify-end" @click.self="showJoinModal = false">
        <div class="absolute inset-0 bg-black/40 transition-opacity"></div>

        <div class="sheet modal-content">
            <div class="sheet-handle"></div>
            <div class="sheet-header">
                <button @click="showJoinModal = false" class="sheet-close tap-effect" aria-label="Закрыть">
                    <span class="material-icons-round text-xl">close</span>
                </button>
                <h3 class="sheet-title">Вход в семью</h3>
                <div>
                    <button
                        @click="handleJoin"
                        :disabled="isJoining || joinCodeInput.length < 6"
                        class="sheet-action tap-effect"
                    >
                        <span v-if="isJoining" class="material-icons-round animate-spin text-sm">sync</span>
                        {{ isJoining ? 'Проверка' : 'Войти' }}
                    </button>
                </div>
            </div>
            <div class="min-h-0 overflow-y-auto px-6 pt-6 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
                <p class="text-sm text-secondary text-center mb-4">Введите 6-значный код приглашения</p>
                <input 
                    v-model="joinCodeInput" 
                    placeholder="000000" 
                    type="tel"
                    inputmode="numeric"
                    class="w-full text-center text-3xl tracking-[0.3em] font-semibold py-4 input-outline rounded-2xl outline-none text-slate-900 placeholder:text-slate-200"
                    maxlength="6"
                >
            </div>
        </div>
    </div>
    </Transition>

  </div>
</template>
