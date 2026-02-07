<template>
  <div
    class="fixed bottom-24 right-5 bg-red-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer z-50"
    @click="openDebugModal"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-8 w-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  </div>
</template>

<script setup>
import { useDebugStore } from '@/stores/debug'

const debugStore = useDebugStore()

function openDebugModal() {
  debugStore.show()
}
</script>
