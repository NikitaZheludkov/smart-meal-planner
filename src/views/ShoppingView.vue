<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useShoppingStore } from '../stores/shopping'

const store = useShoppingStore()
const periodStart = ref(new Date())

const changePeriod = (days) => {
  const newDate = new Date(periodStart.value)
  newDate.setDate(newDate.getDate() + days)
  periodStart.value = newDate
}

const periodLabel = computed(() => {
  const start = new Date(periodStart.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const startStr = start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  const endStr = end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  return `${startStr} - ${endStr}`
})

const loadList = () => {
  const start = periodStart.value.toISOString().split('T')[0]
  const endDate = new Date(periodStart.value)
  endDate.setDate(endDate.getDate() + 6)
  const end = endDate.toISOString().split('T')[0]
  store.generateList(start, end)
}

const shareList = async () => {
  let text = `🛒 *Список покупок (${periodLabel.value})*\n\n`
  store.list.forEach(item => {
    const mark = item.checked ? '✅' : '⭕'
    text += `${mark} ${item.name}: ${Number(item.amount.toFixed(2))} ${item.unit}\n`
  })
  if (navigator.share) {
    try { await navigator.share({ title: 'Список покупок', text: text }) } catch (err) { console.log('Отмена') }
  } else {
    navigator.clipboard.writeText(text)
    alert('Список скопирован в буфер!')
  }
}

watch(periodStart, () => { loadList() })
onMounted(() => { loadList() })
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    
    <div class="bg-slate-50 pt-12 pb-2 px-5 sticky top-0 z-20">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-4">Купить</h1>
      
      <div class="flex items-center justify-between bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
        <button @click="changePeriod(-7)" class="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-900 tap-effect"><span class="material-icons-round text-sm">chevron_left</span></button>
        <div class="text-center">
          <div class="font-bold text-slate-900">{{ periodLabel }}</div>
          <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Неделя</div>
        </div>
        <button @click="changePeriod(7)" class="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-900 tap-effect"><span class="material-icons-round text-sm">chevron_right</span></button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-32 space-y-2 pt-2">
      
      <div v-if="!store.loading && store.list.length === 0" class="text-center py-20 opacity-40">
        <div class="text-6xl mb-2">🛒</div>
        <p class="font-bold text-slate-400">Пусто</p>
      </div>
      
      <div v-if="store.loading" class="text-center py-20 text-slate-400">
        <span class="material-icons-round animate-spin text-3xl">sync</span>
      </div>

      <div 
        v-for="item in store.list" 
        :key="item.id"
        @click="store.toggleItem(item.id)"
        class="bg-white p-4 rounded-[20px] shadow-sm flex items-center gap-4 transition-all tap-effect border border-slate-100/50"
        :class="item.checked ? 'opacity-40' : ''"
      >
        <div 
          class="w-6 h-6 rounded-full border-[2.5px] flex items-center justify-center transition-all"
          :class="item.checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300 bg-white'"
        >
          <span v-if="item.checked" class="material-icons-round text-white text-[14px]">check</span>
        </div>

        <div class="flex-1">
          <div 
            class="font-bold text-slate-800 text-[15px] transition-all"
            :class="item.checked ? 'line-through text-slate-400' : ''"
          >
            {{ item.name }}
          </div>
        </div>

        <div class="text-xs font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg min-w-[50px] text-center">
          {{ Number(item.amount.toFixed(2)) }} <span class="text-slate-400">{{ item.unit }}</span>
        </div>
      </div>
    </div>

    <div class="fixed bottom-24 right-5">
      <button @click="shareList" class="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center tap-effect hover:scale-105 transition-transform">
        <span class="material-icons-round text-2xl">ios_share</span>
      </button>
    </div>

  </div>
</template>