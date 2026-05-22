const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

const vibrate = (pattern) => {
  if (!canVibrate) return
  try {
    navigator.vibrate(pattern)
  } catch {}
}

export const platform = {
  init() {},
  haptic: {
    impact(type = 'light') {
      if (type === 'heavy') vibrate([0, 25])
      else if (type === 'medium') vibrate([0, 15])
      else vibrate([0, 8])
    },
    notification(type = 'success') {
      if (type === 'error') vibrate([0, 20, 40, 20])
      else if (type === 'warning') vibrate([0, 20, 30, 10])
      else vibrate([0, 10, 20, 10])
    },
    selection() {
      vibrate([0, 5])
    }
  },
  async copyText(text) {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

