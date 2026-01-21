<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()

// ИСПРАВЛЕНИЕ: Инициализируем сразу значениями из стора!
// App.vue уже загрузил их, поэтому они доступны синхронно.
const selectedStartDay = ref(settingsStore.startDay)
const selectedPeriod = ref(settingsStore.periodLength)
const selectedPortions = ref(settingsStore.defaultPortions)

// Состояние кнопки
const isSaving = ref(false)
const saveButtonText = ref('Сохранить изменения')

// Опции
const weekDays = [
  { val: 1, label: 'Понедельник' },
  { val: 2, label: 'Вторник' },
  { val: 3, label: 'Среда' },
  { val: 4, label: 'Четверг' },
  { val: 5, label: 'Пятница' },
  { val: 6, label: 'Суббота' },
  { val: 0, label: 'Воскресенье' }
]

const periods = [
  { val: 3, label: '3 дня' },
  { val: 7, label: 'Неделя (7 дней)' },
  { val: 14, label: '2 Недели' }
]

// Сохранение
const handleSave = async () => {
  isSaving.value = true
  saveButtonText.value = 'Сохраняем...'
  
  try {
      await settingsStore.saveSettings(
          selectedStartDay.value, 
          selectedPeriod.value, 
          selectedPortions.value
      )
      
      saveButtonText.value = 'Успешно!'
      setTimeout(() => {
          saveButtonText.value = 'Сохранить изменения'
      }, 2000)
  } catch (e) {
      alert('Ошибка сохранения')
      saveButtonText.value = 'Ошибка'
  } finally {
      isSaving.value = false
  }
}

const handleLogout = async () => {
  if (confirm('Вы точно хотите выйти?')) {
    await authStore.signOut()
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 relative">
    
    <div class="bg-white px-5 pt-12 pb-6 rounded-b-[32px] shadow-sm z-10 sticky top-0">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight">Настройки</h1>
      <p class="text-sm font-bold text-slate-400 mt-1">Персонализация</p>
    </div>

    <div class="flex-1 px-5 py-6 space-y-6 overflow-y-auto pb-32">
      
      <div>
        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 mb-3">Вид Планировщика</h3>
        
        <div class="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 space-y-4">
          
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <span class="material-icons-round">today</span>
              </div>
              <div>
                <div class="font-bold text-slate-900 text-sm">Начало недели</div>
                <div class="text-[10px] font-bold text-slate-400">С какого дня показывать сетку</div>
              </div>
            </div>
            <select 
              v-model="selectedStartDay" 
              class="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition-colors"
            >
              <option v-for="day in weekDays" :key="day.val" :value="day.val">{{ day.label }}</option>
            </select>
          </div>

          <div class="h-[1px] bg-slate-50 w-full"></div>

          <div class="flex items-center justify-between">
             <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
                <span class="material-icons-round">date_range</span>
              </div>
              <div>
                <div class="font-bold text-slate-900 text-sm">Период</div>
                 <div class="text-[10px] font-bold text-slate-400">Сколько дней отображать</div>
              </div>
            </div>
            <select 
              v-model="selectedPeriod" 
              class="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-purple-500 transition-colors"
            >
              <option v-for="p in periods" :key="p.val" :value="p.val">{{ p.label }}</option>
            </select>
          </div>

          <div class="h-[1px] bg-slate-50 w-full"></div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
               <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                <span class="material-icons-round">restaurant_menu</span>
              </div>
              <div>
                <div class="font-bold text-slate-900 text-sm">Порции</div>
                <div class="text-[10px] font-bold text-slate-400">По умолчанию при добавлении</div>
              </div>
            </div>
            
            <div class="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1">
                <button 
                  @click="selectedPortions = Math.max(1, selectedPortions - 1)"
                  class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 tap-effect"
                >
                  <span class="material-icons-round text-sm">remove</span>
                </button>
                <span class="w-8 text-center font-black text-slate-800 text-sm">{{ selectedPortions }}</span>
                 <button 
                  @click="selectedPortions++"
                  class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 tap-effect"
                >
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
          class="w-full bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 flex items-center justify-between tap-effect active:scale-[0.98] transition-transform"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
              <span class="material-icons-round text-2xl">logout</span>
            </div>
            <div class="text-left">
               <div class="font-bold text-slate-900 text-base">Выйти</div>
              <div class="text-[11px] font-bold text-slate-400 leading-tight">Завершить сеанс</div>
            </div>
          </div>
          <span class="material-icons-round text-slate-300">chevron_right</span>
        </button>
      </div>
      
      <div class="text-center py-4">
         <p class="text-[10px] font-bold text-slate-300 uppercase">Версия 1.0.0 Release</p>
      </div>

    </div>

    <div class="absolute bottom-20 left-0 right-0 p-5 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-20">
        <button 
            @click="handleSave"
            :disabled="isSaving"
            class="w-full py-4 rounded-2xl font-bold text-white text-base shadow-xl tap-effect transition-all flex items-center justify-center gap-2"
             :class="saveButtonText === 'Успешно!' ? 'bg-green-500 shadow-green-500/30' : 'bg-slate-900 shadow-slate-900/30'"
        >
            <span v-if="isSaving" class="material-icons-round animate-spin text-sm">sync</span>
            <span v-if="saveButtonText === 'Успешно!'" class="material-icons-round text-sm">check</span>
            {{ saveButtonText }}
        </button>
    </div>

  </div>
</template>