import { defineStore } from 'pinia'
import { ref } from 'vue'
import { platform } from '../lib/platform'

export const usePlatformStore = defineStore('platform', () => {
  const isKeyboardOpen = ref(false)

  const init = () => {
    platform.init()

    const onFocusIn = (e) => {
      const tag = e?.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') isKeyboardOpen.value = true
    }

    const onFocusOut = () => {
      isKeyboardOpen.value = false
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
  }

  return { isKeyboardOpen, init, haptic: platform.haptic, copyText: platform.copyText }
})

