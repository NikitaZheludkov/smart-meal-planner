<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useTelegramStore } from '../stores/telegram'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const telegram = useTelegramStore()

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
const joinCodeInput = ref('')
const isGenerating = ref(false)
const isJoining = ref(false)

const isOwner = computed(() => {
    if (!settingsStore.household || !authStore.user) return false
    return settingsStore.household.owner_id === authStore.user.id
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

const handleGenerateCode = async () => {
    if (isGenerating.value) return
    isGenerating.value = true
    telegram.haptic.impact('medium')
    try {
        await settingsStore.generateInviteCode()
    } catch (e) {
        alert(e.message)
    } finally {
        isGenerating.value = false
    }
}

const copyCode = () => {
    if (settingsStore.household?.invite_code) {
        navigator.clipboard.writeText(settingsStore.household.invite_code)
        telegram.haptic.notification('success')
        alert('Код скопирован!')
    }
}

const handleJoin = async () => {
    if (!joinCodeInput.value) {
        alert('Введите код')
        return
    }
    
    isJoining.value = true
    telegram.haptic.notification('success')
    
    try {
        await settingsStore.joinHousehold(joinCodeInput.value)
    } catch (e) {
        telegram.haptic.notification('error')
        alert('Ошибка: ' + e.message)
        isJoining.value = false
    }
}

const handleLeave = async () => {
    telegram.haptic.notification('warning')
    if(confirm('Вы точно хотите покинуть эту семью? Вы вернетесь к своим личным данным.')) {
        try {
            await settingsStore.leaveHousehold()
        } catch (e) {
            alert(e.message)
        }
    }
}

const handleSave = async () => {
    try {
        telegram.haptic.notification('success')
        // Force period to 7 days
        await settingsStore.saveSettings(selectedStartDay.value, 7, selectedPortions.value)
        alert('Настройки сохранены')
    } catch (e) {
        console.error('Settings save error:', e)
        telegram.haptic.notification('error')
        alert(e.message || 'Не удалось сохранить настройки. Проверьте соединение.')
    }
}

const handleLogout = async () => {
    telegram.haptic.impact('medium')
    if (confirm('Выйти из аккаунта?')) {
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
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-10 sticky top-0 border-b border-slate-100 px-5 pt-app-header pb-4">
      <h1 class="app-title mb-4">настройки</h1>
      <div class="flex items-center justify-between">
        <div>
          
          <div class="flex items-center gap-2 mt-1">
              <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                  {{ getInitials(authStore.user?.user_metadata?.first_name) }}
              </div>
              <p class="text-sm font-bold text-slate-500">
                  {{ authStore.user?.user_metadata?.first_name || 'Пользователь' }}
              </p>
          </div>
        </div>
        <button 
          @click="handleSave" 
          class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect"
        >
          Сохранить
        </button>
      </div>
    </div>

    <div class="flex-1 px-5 py-4 space-y-6 overflow-y-auto pb-[76px]">
      
      <div>
        <h3 class="card-title text-sm ml-2 mb-2">Моя Семья</h3>
        
        <div v-if="settingsStore.loading" class="text-center py-6">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
        </div>

        <div v-else class="bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 space-y-4">
            
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-[10px] font-normal text-secondary uppercase">Вы находитесь в:</div>
                    <div class="text-lg card-title leading-tight">
                        {{ settingsStore.household?.name || 'Загрузка...' }}
                    </div>
                </div>
                <div v-if="isOwner" class="bg-amber-100 text-amber-600 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide">
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
                            {{ member.first_name || member.username }}
                            <span v-if="isMe(member.id)" class="text-indigo-500 ml-1">(Вы)</span>
                        </div>
                        <div class="text-[10px] font-normal text-secondary">
                            {{ member.id === settingsStore.household?.owner_id ? 'Администратор' : 'Участник' }}
                        </div>
                    </div>
                </div>
            </div>

            <div class="h-[1px] bg-slate-50 w-full"></div>

            <div v-if="isOwner">
                <div v-if="settingsStore.household?.invite_code">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">Код для приглашения</div>
                    
                    <button @click="copyCode" class="w-full bg-slate-900 rounded-2xl p-4 relative overflow-hidden group tap-effect active:scale-95 transition-transform mb-2">
                        <div class="text-3xl font-black text-white tracking-[0.2em] text-center">
                            {{ settingsStore.household.invite_code }}
                        </div>
                        <div class="text-[9px] text-slate-400 text-center mt-1 font-bold uppercase tracking-widest">
                            Нажми, чтобы скопировать
                        </div>
                    </button>

                    <button @click="handleGenerateCode" class="w-full text-xs font-bold text-slate-400 py-2 hover:text-slate-600 transition-colors">
                        {{ isGenerating ? 'Обновляем...' : 'Сгенерировать новый код' }}
                    </button>
                </div>
                
                <button 
                    v-else 
                    @click="handleGenerateCode"
                    class="w-full py-3 bg-indigo-500 text-white rounded-xl font-bold text-xs tap-effect shadow-lg shadow-indigo-500/20"
                >
                    {{ isGenerating ? 'Создаем...' : 'Получить код доступа' }}
                </button>

                <button 
                    @click="showJoinModal = true"
                    class="w-full mt-2 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs tap-effect"
                >
                    Вступить в другую семью
                </button>
            </div>

            <div v-else>
                 <button 
                    @click="handleLeave"
                    class="w-full py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold text-xs tap-effect flex items-center justify-center gap-2"
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
          class="w-full bg-white p-4 rounded-[20px] shadow-sm border border-slate-100 flex items-center justify-center gap-2 tap-effect text-red-500 font-bold text-sm"
        >
             <span class="material-icons-round">logout</span>
             <span>Выйти из аккаунта</span>
        </button>
      </div>

    </div>

    

    <Transition name="modal">
    <div v-if="showJoinModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="showJoinModal = false">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
        <div class="bg-white w-full max-w-xs rounded-[32px] p-6 relative z-10 modal-content">
            <div class="text-center mb-6">
                <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">🔑</div>
                <h3 class="text-xl font-black text-slate-900">Вход в семью</h3>
                <p class="text-xs text-slate-400 font-bold mt-1">Введите 6-значный код приглашения</p>
            </div>
            
            <input 
                v-model="joinCodeInput" 
                placeholder="000 000" 
                type="tel"
                class="w-full text-center text-3xl tracking-[0.2em] font-black p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-2 ring-indigo-500/20 mb-4 text-slate-900 placeholder:text-slate-200"
                maxlength="6"
            >
            
            <button 
                @click="handleJoin" 
                :disabled="isJoining || joinCodeInput.length < 6"
                class="w-full py-3.5 bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 mb-2 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
            >
                <span v-if="isJoining" class="material-icons-round animate-spin text-sm">sync</span>
                {{ isJoining ? 'Проверка...' : 'Войти' }}
            </button>
            
            <button @click="showJoinModal = false" class="w-full py-3 text-slate-400 font-bold text-xs tap-effect">Отмена</button>
        </div>
    </div>
    </Transition>

  </div>
</template>
