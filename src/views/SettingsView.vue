<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const platform = usePlatformStore()
const ui = useUIStore()

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

watch(showJoinModal, (newVal) => {
    ui.isModalOpen = newVal
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
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4 h-[160px] flex flex-col justify-between">
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

    <div class="flex-1 px-5 py-4 space-y-6 overflow-y-auto pb-[76px]">
      
      <div>
        <h3 class="card-title text-sm ml-2 mb-2">Моя Семья</h3>
        
        <div v-if="settingsStore.loading" class="text-center py-6">
            <span class="material-icons-outlined animate-spin text-slate-300">sync</span>
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

          <div class="flex items-center justify-between">
            <span class="card-title text-sm">Порции (по умолч.)</span>
            <div class="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1">
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
        <button 
          @click="handleLogout" 
          class="w-full bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 flex items-center justify-center gap-2 tap-effect text-slate-900 font-bold text-sm"
        >
             <span class="material-icons-round">logout</span>
             <span>Выйти из аккаунта</span>
        </button>
      </div>

    </div>

    

    <Transition name="modal">
    <div v-if="showJoinModal" class="fixed inset-0 z-50 flex flex-col justify-end" @click.self="showJoinModal = false">
        <div class="absolute inset-0 bg-black/40 transition-opacity"></div>
        
        <div class="relative w-full h-[92vh] max-h-[92vh] bg-white rounded-t-3xl overflow-hidden flex flex-col shadow-2xl modal-content">
            <div class="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2 shrink-0"></div>
            <div class="flex-1 p-8 flex flex-col items-center justify-center">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm border border-slate-100">🔑</div>
                    <h3 class="text-2xl font-black text-slate-900">Вход в семью</h3>
                    <p class="text-sm text-slate-400 font-bold mt-2">Введите 6-значный код приглашения</p>
                </div>
                
                <input 
                    v-model="joinCodeInput" 
                    placeholder="000 000" 
                    type="tel"
                    class="w-full text-center text-4xl tracking-[0.2em] font-black p-6 bg-slate-50 rounded-[24px] outline-none border-none mb-6 text-slate-900 placeholder:text-slate-200 shadow-inner"
                    maxlength="6"
                >
                
                <div class="w-full space-y-3">
                    <button 
                        @click="handleJoin" 
                        :disabled="isJoining || joinCodeInput.length < 6"
                        class="btn-primary w-full py-4 shadow-xl flex items-center justify-center gap-2"
                    >
                        <span v-if="isJoining" class="material-icons-round animate-spin text-lg">sync</span>
                        {{ isJoining ? 'Проверка...' : 'Войти в семью' }}
                    </button>
                    
                    <button @click="showJoinModal = false" class="btn-secondary w-full py-4 text-sm font-bold">Отмена</button>
                </div>
            </div>
        </div>
    </div>
    </Transition>

  </div>
</template>
