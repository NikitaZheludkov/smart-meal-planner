<script setup>
import { computed, watch, onUnmounted } from 'vue'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { usePlatformStore } from '../stores/platform'
import { AUTO_TAGS } from '../lib/suggestions'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const dictionaries = useDictionariesStore()
const uiStore = useUIStore()
const platform = usePlatformStore()
const modalRegistryId = `dish-filter-${Math.random().toString(36).slice(2)}`

watch(() => props.isOpen, (newVal) => {
    uiStore.syncModalState(modalRegistryId, newVal)
}, { immediate: true })

onUnmounted(() => {
    uiStore.clearModalState(modalRegistryId)
})

// Раньше теги пытались группировать по tag.category ("Время"/"Сценарий"/
// "Здоровье"), но в коллекции dish_tags такого поля нет вообще — в итоге
// каждый тег уходил в категорию "other", которую группировка молча
// выбрасывала (order.map перебирал только 'time'/'context'/'diet'), и
// список всегда был пустым. Тегов сейчас всего 5 и группировать их
// пока не по чему — показываем плоским списком, как они есть.

// Вычисляемые признаки идут первыми, затем теги пользователя
const filterOptions = computed(() => [
    ...AUTO_TAGS.map((t) => ({ id: t.id, name: t.name })),
    ...(dictionaries.availableTags || []).map((t) => ({ id: t.id, name: t.name }))
])

const isSelected = (tagId) => {
    return uiStore.dishes.filterTags.includes(tagId)
}

const toggleFilter = (tagId) => {
    platform.haptic.selection()
    
    const idx = uiStore.dishes.filterTags.indexOf(tagId)
    if (idx > -1) {
        uiStore.dishes.filterTags.splice(idx, 1)
    } else {
        uiStore.dishes.filterTags.push(tagId)
    }
}

const resetFilters = () => {
    platform.haptic.notification('warning')
    uiStore.dishes.filterTags = []
}

const close = () => {
    platform.haptic.impact('light')
    emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[70] flex flex-col justify-end" @click.self="close">
      <div class="absolute inset-0 bg-black/40 transition-opacity"></div>

      <div class="sheet modal-content">
        <div class="sheet-handle"></div>

        <div class="sheet-header">
          <button @click="close" class="sheet-close tap-effect" aria-label="Закрыть">
            <span class="material-icons-round text-xl">close</span>
          </button>
          <h2 class="sheet-title">
            Теги<span v-if="uiStore.dishes.filterTags.length > 0" class="text-slate-400"> · {{ uiStore.dishes.filterTags.length }}</span>
          </h2>
          <div>
            <button v-if="uiStore.dishes.filterTags.length > 0" @click="resetFilters" class="sheet-action-text tap-effect">
              Сбросить
            </button>
          </div>
        </div>

        <div class="min-h-0 overflow-y-auto px-5 pt-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] no-scrollbar">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in filterOptions"
              :key="tag.id"
              @click="toggleFilter(tag.id)"
              class="chip tap-effect"
              :class="isSelected(tag.id) ? 'chip-active' : ''"
            >
              {{ tag.name }}
            </button>
          </div>
          <p class="text-[11px] text-secondary mt-4">Показываются блюда, у которых есть все выбранные теги.</p>
        </div>
      </div>
    </div>
  </Transition>
</template>
