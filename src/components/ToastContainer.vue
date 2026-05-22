
<script setup>
import { useUIStore } from '../stores/ui'
import { storeToRefs } from 'pinia'

const ui = useUIStore()
const { toasts } = storeToRefs(ui)

const getBgColor = (type) => {
  switch (type) {
    case 'success': return 'bg-green-500'
    case 'error': return 'bg-red-500'
    case 'warn': return 'bg-yellow-500'
    default: return 'bg-blue-500'
  }
}
</script>

<template>
  <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
    <transition-group name="toast" move-class="">
      <div 
        v-for="toast in toasts" 
        :key="toast.id"
        class="text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between pointer-events-auto"
        :class="getBgColor(toast.type)"
      >
        <span>{{ toast.message }}</span>
        <button @click="ui.toasts = ui.toasts.filter(t => t.id !== toast.id)" class="ml-3 text-white/80 hover:text-white">
            ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur-fast) var(--easing-base), transform var(--dur-fast) var(--easing-base);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
.toast-leave-active {
  position: absolute;
  width: 100%;
}
</style>
