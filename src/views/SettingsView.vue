<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'

const settings = useSettingsStore()
const auth = useAuthStore()

const inviteCode = ref('...')
const showCopied = ref(false)
const showJoinInput = ref(false)
const joinCode = ref('')

const daysOfWeek = [
  { val: 1, label: 'Понедельник' },
  { val: 2, label: 'Вторник' },
  { val: 3, label: 'Среда' },
  { val: 4, label: 'Четверг' },
  { val: 5, label: 'Пятница' },
  { val: 6, label: 'Суббота' },
  { val: 0, label: 'Воскресенье' }
]

const periodOptions = [
  { val: 3, label: '3 дня' },
  { val: 7, label: 'Неделя (7 дней)' },
  { val: 14, label: '2 недели (14 дней)' }
]

const save = () => settings.updateSettings(settings.startDay, settings.periodLength)

const copyCode = () => {
  navigator.clipboard.writeText(inviteCode.value)
  showCopied.value = true
  setTimeout(() => showCopied.value = false, 2000)
}

const handleJoin = async () => {
  try {
    if(!joinCode.value) return
    if(confirm('Внимание! Вы переключитесь на базу данных другого пользователя. Ваши текущие данные станут недоступны (пока вы не вернетесь). Продолжить?')) {
       await auth.joinHousehold(joinCode.value)
    }
  } catch (e) {
    alert('Ошибка: ' + e.message)
  }
}

onMounted(async () => {
  settings.fetchSettings()
  inviteCode.value = await auth.getInviteCode()
})
</script>

<template>
  <div class="p-5 space-y-6 pb-24 bg-slate-50 min-h-full">
    
    <h2 class="text-3xl font-black text-slate-900 tracking-tight">Настройки</h2>

    <div class="flex items-center gap-4 bg-white p-5 rounded-[24px] shadow-sm border border-slate-100">
      <div class="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-2xl shadow-lg">
        {{ auth.user?.first_name?.charAt(0) || 'U' }}
      </div>
      <div>
        <div class="font-bold text-slate-900 text-lg">{{ auth.user?.first_name || 'Пользователь' }}</div>
        <div class="text-xs font-bold text-slate-400">ID: {{ auth.user?.id }}</div>
      </div>
    </div>

    <div class="bg-indigo-600 rounded-[28px] p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
      
      <div class="relative z-10">
        <h3 class="font-bold text-lg mb-1">Совместный доступ</h3>
        <p class="text-indigo-100 text-xs font-medium mb-4 opacity-80 leading-relaxed">
          Отправьте этот код партнеру, чтобы он мог пользоваться вашей базой продуктов и планом.
        </p>
        
        <div @click="copyCode" class="bg-white/10 backdrop-blur-md rounded-xl p-3 flex justify-between items-center cursor-pointer border border-white/20 tap-effect">
          <span class="font-mono font-bold text-xl tracking-widest pl-2">{{ inviteCode }}</span>
          <div class="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
            {{ showCopied ? 'Скопировано' : 'Копировать' }}
          </div>
        </div>
      </div>
    </div>

    <div class="text-center">
      <button v-if="!showJoinInput" @click="showJoinInput = true" class="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
        Подключиться к чужой базе (ввести код)
      </button>
      
      <div v-else class="bg-white p-2 pl-4 rounded-2xl flex items-center shadow-sm border border-slate-100 animate-fade-in mt-2">
        <input v-model="joinCode" type="text" placeholder="КОД ПРИГЛАШЕНИЯ" class="flex-1 font-bold text-slate-700 outline-none uppercase text-sm">
        <button @click="handleJoin" class="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md tap-effect">
          <span class="material-icons-round text-sm">arrow_forward</span>
        </button>
      </div>
    </div>

    <div class="space-y-3 pt-2">
      <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Календарь</h3>
      
      <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
        <span class="font-bold text-slate-700 text-sm">Начало недели</span>
        <select v-model="settings.startDay" @change="save" class="bg-slate-50 text-slate-900 font-bold text-xs py-2 px-3 rounded-xl outline-none border-none text-right">
          <option v-for="day in daysOfWeek" :key="day.val" :value="day.val">{{ day.label }}</option>
        </select>
      </div>

      <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
        <span class="font-bold text-slate-700 text-sm">Дней в периоде</span>
        <select v-model="settings.periodLength" @change="save" class="bg-slate-50 text-slate-900 font-bold text-xs py-2 px-3 rounded-xl outline-none border-none text-right">
          <option v-for="opt in periodOptions" :key="opt.val" :value="opt.val">{{ opt.label }}</option>
        </select>
      </div>
    </div>

  </div>
</template>

<style>
.animate-fade-in { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>