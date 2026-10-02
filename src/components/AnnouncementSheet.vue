<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useAppConfigStore } from '../stores/appConfig'
import { useUIStore } from '../stores/ui'

// Объявление из панели администратора. Показывается один раз на каждый
// новый текст: прочитанный текст запоминается в localStorage.
const STORAGE_KEY = 'announcement_seen'

const appConfig = useAppConfigStore()
const ui = useUIStore()
const modalRegistryId = `announcement-${Math.random().toString(36).slice(2)}`

const readSeen = () => {
  try { return localStorage.getItem(STORAGE_KEY) || '' } catch (_) { return '' }
}
const seenText = ref(readSeen())

const isOpen = computed(() =>
  appConfig.announcement.enabled && !!appConfig.announcement.text && appConfig.announcement.text !== seenText.value
)

watch(isOpen, (open) => ui.syncModalState(modalRegistryId, open), { immediate: true })
onUnmounted(() => ui.clearModalState(modalRegistryId))

const close = () => {
  seenText.value = appConfig.announcement.text
  try { localStorage.setItem(STORAGE_KEY, seenText.value) } catch (_) {}
}
</script>

<template>
  <Transition name="modal" appear>
    <div v-if="isOpen" class="fixed inset-0 z-[90] flex flex-col justify-end" @click.self="close">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="sheet modal-content">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <button @click="close" class="sheet-close tap-effect" aria-label="Закрыть">
            <span class="material-icons-round text-xl">close</span>
          </button>
          <h3 class="sheet-title">Объявление</h3>
          <div></div>
        </div>
        <div class="min-h-0 overflow-y-auto px-6 pt-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
          <p class="text-sm leading-relaxed text-slate-900 whitespace-pre-wrap">{{ appConfig.announcement.text }}</p>
          <button @click="close" class="btn-primary w-full text-sm mt-6">Понятно</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
