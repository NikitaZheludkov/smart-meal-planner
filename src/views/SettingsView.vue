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

// Инициализация при открытии
onMounted(() => {
    selectedStartDay.value = settingsStore.startDay
    selectedPeriod.value = settingsStore.periodLength
    selectedPortions.value = settingsStore.defaultPortions
})

// --- ЛОГИКА СЕМЬИ ---
const showJoinModal = ref(false)
const joinCodeInput = ref('')
const isGenerating = ref(false)

const isOwner = computed(() => {
    return settingsStore.household?.owner_id === authStore.user?.id
})

// Генерация кода
const handleGenerateCode = async () => {
    isGenerating.value = true
    telegram.haptic.impact('medium')
    await settingsStore.generateInviteCode()
    isGenerating.value = false
}

// Вход по коду
const handleJoin = async () => {
    if (joinCodeInput.value.length < 6) return
    try {
        telegram.haptic.notification('success')
        await settingsStore.joinHousehold(joinCodeInput.value)
    } catch (e) {
        telegram.haptic.notification('error')
        alert(e.message)
    }
}

// Выход из семьи
const handleLeave = async () => {
    if(confirm('Вы точно хотите покинуть эту семью и создать новую пустую?')) {
        telegram.haptic.impact('heavy')
        await settingsStore.leaveHousehold()
    }
}

// Сохранение настроек
const isSaving = ref(false)
const saveButtonText = ref('Сохранить изменения')

const handleSave = async () => {
  isSaving.value = true
  saveButtonText.value = 'Сохраняем...'
  try {
      await settingsStore.saveSettings(selectedStartDay.value, selectedPeriod.value, selectedPortions.value)
      saveButtonText.value = 'Успешно!'
      telegram.haptic.notification('success')
      setTimeout(() => { saveButtonText.value = 'Сохранить изменения' }, 2000)
  } catch (e) {
      saveButtonText.value = 'Ошибка'
  } finally {
      isSaving.value = false
  }
}

const handleLogout = async () => {
    telegram.haptic.impact('medium')
    if (confirm('Выйти из аккаунта?')) {
        await authStore.signOut()
    }
}

// Опции для селектов
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
    
    <div class="bg-white px-5 pt-12 pb-6 rounded-b-[32px] shadow-sm z-10 sticky top-0">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight">Настройки</h1>
      <div class="flex items-center gap-2 mt-2">
          <div v-if="authStore.user?.user_metadata?.avatar_url" class="w-6 h-6 rounded-full overflow-hidden bg-slate-100">
              <img :src="authStore.user.user_metadata.avatar_url" class="w-full h-full object-cover">
          </div>
          <p class="text-sm font-bold text-slate-400">
              {{ authStore.user?.user_metadata?.first_name || 'Пользователь' }}
          </p>
      </div>
    </div>

    <div class="flex-1 px-5 py-6 space-y-8 overflow-y-auto pb-32">
      
      <div>
        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 mb-3">Совместный доступ</h3>
        
        <div class="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 space-y-5">
            
            <div>
                <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">Участники</div>
                <div class="flex -space-x-2 overflow-hidden py-1">
                    <div 
                        v-for="member in settingsStore.familyMembers" 
                        :key="member.id"
                        class="inline-block h-10 w-10 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-lg relative"
                    >
                        <img v-if="member.avatar_url" :src="member.avatar_url" class="w-full h-full rounded-full object-cover">
                        <span v-else>👤</span>
                    </div>
                </div>
            </div>

            <div class="h-[1px] bg-slate-50 w-full"></div>

            <div v-if="isOwner">
                <div v-if="settingsStore.household?.invite_code">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">Код приглашения</div>
                    <div class="bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-4 text-center relative overflow-hidden group" @click="telegram.haptic.selection()">
                        <div class="text-3xl font-black text-indigo-600 tracking-[0.2em]">{{ settingsStore.household.invite_code }}</div>
                    </div>
                    <button @click="handleGenerateCode" class="w-full mt-2 text-xs font-bold text-slate-400 py-2">
                        {{ isGenerating ? 'Обновляем...' : 'Сгенерировать новый код' }}
                    </button>
                </div>
                
                <button 
                    v-else 
                    @click="handleGenerateCode"
                    class="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs tap-effect"
                >
                    Получить код приглашения
                </button>
            </div>

            <div v-else>
                 <button 
                    @click="handleLeave"
                    class="w-full py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold text-xs tap-effect"
                >
                    Покинуть семью
                </button>
            </div>

            <button 
                v-if="isOwner && settingsStore.familyMembers.length === 1" 
                @click="showJoinModal = true"
                class="w-full py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs tap-effect"
            >
                Ввести код другой семьи
            </button>

        </div>
      </div>

      <div>
        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 mb-3">Вид Планировщика</h3>
        <div class="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 space-y-4">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-700 text-sm">Начало недели</span>
            <select v-model="selectedStartDay" class="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none">
              <option v-for="day in weekDays" :key="day.val" :value="day.val">{{ day.label }}</option>
            </select>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-700 text-sm">Период</span>
            <select v-model="selectedPeriod" class="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none">
              <option v-for="p in periods" :key="p.val" :value="p.val">{{ p.label }}</option>
            </select>
          </div>

          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-700 text-sm">Порции (по умолч.)</span>
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
        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 mb-3">Аккаунт</h3>
        <button 
          @click="handleLogout" 
          class="w-full bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 flex items-center justify-between tap-effect"
        >
          <div class="flex items-center gap-3">
             <span class="material-icons-round text-red-400">logout</span>
             <span class="font-bold text-slate-900 text-sm">Выйти</span>
          </div>
        </button>
      </div>

    </div>

    <div class="absolute bottom-20 left-0 right-0 p-5 z-20 pointer-events-none">
        <button 
            @click="handleSave"
            :disabled="isSaving"
            class="w-full py-4 rounded-2xl font-bold text-white text-base shadow-xl tap-effect transition-all flex items-center justify-center gap-2 pointer-events-auto"
             :class="saveButtonText === 'Успешно!' ? 'bg-green-500' : 'bg-slate-900'"
        >
            <span v-if="isSaving" class="material-icons-round animate-spin text-sm">sync</span>
            {{ saveButtonText }}
        </button>
    </div>

    <div v-if="showJoinModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" @click.self="showJoinModal = false">
        <div class="bg-white w-full max-w-xs rounded-[32px] p-6 animate-bounce-slow">
            <h3 class="text-xl font-black text-slate-900 text-center mb-4">Ввод кода</h3>
            <input 
                v-model="joinCodeInput" 
                placeholder="Например: 123456" 
                class="w-full text-center text-2xl tracking-widest font-black p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-2 ring-indigo-500/20 mb-4"
                maxlength="6"
            >
            <button @click="handleJoin" class="w-full py-3 bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 mb-2">Присоединиться</button>
            <button @click="showJoinModal = false" class="w-full py-3 text-slate-400 font-bold text-xs">Отмена</button>
        </div>
    </div>

  </div>
</template>