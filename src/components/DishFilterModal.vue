<script setup>
import { computed } from 'vue'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { useTelegramStore } from '../stores/telegram'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const dictionaries = useDictionariesStore()
const uiStore = useUIStore()
const telegram = useTelegramStore()

// Категории для группировки
const categoryLabels = {
    'time': 'Время',
    'context': 'Сценарий',
    'diet': 'Здоровье',
    'other': 'Прочее'
}

// Группировка тегов
const groupedTags = computed(() => {
    const groups = {}
    dictionaries.availableTags.forEach(tag => {
        const cat = tag.category || 'other'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(tag)
    })
    
    const order = ['time', 'context', 'diet']
    
    return order.map(code => ({
        code,
        label: categoryLabels[code],
        tags: groups[code] || []
    })).filter(g => g.tags.length > 0)
})

const isSelected = (tagId) => {
    return uiStore.dishes.filterTags.includes(tagId)
}

const toggleFilter = (tagId) => {
    telegram.haptic.selection()
    
    const idx = uiStore.dishes.filterTags.indexOf(tagId)
    if (idx > -1) {
        uiStore.dishes.filterTags.splice(idx, 1)
    } else {
        uiStore.dishes.filterTags.push(tagId)
    }
}

const resetFilters = () => {
    telegram.haptic.notification('warning')
    uiStore.dishes.filterTags = []
}

const close = () => {
    telegram.haptic.impact('light')
    emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[80] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="close">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
      
      <div class="bg-white w-full max-w-sm h-[calc(100%-48px)] sm:rounded-[32px] rounded-t-[32px] shadow-2xl relative z-10 flex flex-col modal-content">
        
        <div class="px-5 pt-5 pb-3 border-b border-slate-50 flex justify-between items-center bg-white rounded-t-[32px]">
          <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900">Фильтры</h2>
              <span v-if="uiStore.dishes.filterTags.length > 0" class="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {{ uiStore.dishes.filterTags.length }}
              </span>
          </div>
          
          <button @click="resetFilters" class="text-xs font-bold text-red-400 px-3 py-2 hover:bg-red-50 rounded-xl transition-colors" v-if="uiStore.dishes.filterTags.length > 0">
              Сбросить
          </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 pt-4 pb-20 no-scrollbar">
          <div class="space-y-6">
             <div v-for="group in groupedTags" :key="group.code" class="space-y-3">
                <div class="flex items-center gap-2 px-1">
                   <div class="text-xs font-black text-slate-400">{{ group.label }}</div>
                   <div class="h-[1px] bg-slate-200 flex-1"></div>
                </div>
                <div class="flex flex-wrap gap-2">
                     <button 
                        v-for="tag in group.tags" 
                        :key="tag.id" 
                        @click="toggleFilter(tag.id)"
                        class="px-4 py-2.5 rounded-xl text-xs font-bold transition-all border tap-effect flex items-center gap-1.5"
                        :class="isSelected(tag.id) ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200'"
                     >
                        <span>{{ tag.icon }}</span>
                        <span>{{ tag.name }}</span>
                     </button>
                </div>
             </div>
          </div>
      </div>

      <div class="p-5 border-t border-slate-50 bg-white pb-safe rounded-b-[32px]">
          <button @click="close" class="w-full bg-indigo-500 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-500/30 tap-effect">
              Применить
          </button>
      </div>

    </div>
    </div>
  </Transition>
</template>