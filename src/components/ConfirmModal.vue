<script setup>
import { computed } from 'vue'
import { useUIStore } from '../stores/ui'
import { storeToRefs } from 'pinia'

const ui = useUIStore()
const { confirmState, isConfirmOpen } = storeToRefs(ui)

const title = computed(() => confirmState.value?.title || '')
const message = computed(() => confirmState.value?.message || '')
const okText = computed(() => confirmState.value?.okText || 'ОК')
const cancelText = computed(() => confirmState.value?.cancelText || 'Отмена')

const onCancel = () => ui.resolveConfirm(false)
const onOk = () => ui.resolveConfirm(true)
</script>

<template>
  <Transition name="modal">
    <div v-if="isConfirmOpen" class="fixed inset-0 z-[3000] flex items-center justify-center px-5" @click.self="onCancel">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="relative w-full max-w-sm bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden">
        <div class="p-5">
          <div class="text-sm font-black text-slate-900">{{ title }}</div>
          <div class="mt-2 text-xs text-slate-600 font-bold leading-relaxed whitespace-pre-line">{{ message }}</div>
        </div>
        <div class="px-5 pb-5 flex gap-2">
          <button @click="onCancel" class="flex-1 py-3 rounded-full bg-slate-100 text-slate-700 font-black text-xs tap-effect">
            {{ cancelText }}
          </button>
          <button @click="onOk" class="flex-1 py-3 rounded-full bg-slate-900 text-white font-black text-xs tap-effect">
            {{ okText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

