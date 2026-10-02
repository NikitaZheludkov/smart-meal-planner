import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pb } from '../lib/supabase'

// Глобальные настройки приложения (коллекция app_settings, читать могут все)
// и признак "текущий пользователь — администратор" (коллекция app_admins,
// пользователь видит только свою запись).
export const useAppConfigStore = defineStore('appConfig', () => {
  const registrationOpen = ref(true)
  const voiceInputEnabled = ref(true)
  const announcement = ref({ enabled: false, text: '' })
  const isAdmin = ref(false)

  const applySetting = (key, value) => {
    if (key === 'registration_open') registrationOpen.value = value !== false
    if (key === 'voice_input_enabled') voiceInputEnabled.value = value !== false
    if (key === 'announcement') announcement.value = { enabled: !!value?.enabled, text: value?.text || '' }
  }

  const fetchConfig = async () => {
    try {
      const items = await pb.collection('app_settings').getFullList({ requestKey: null })
      items.forEach((item) => applySetting(item.key, item.value))
    } catch (e) {
      // Нет коллекции/сети — работаем со значениями по умолчанию
      console.warn('App settings load failed', e)
    }
  }

  const checkAdmin = async () => {
    if (!pb.authStore.isValid) {
      isAdmin.value = false
      return
    }
    try {
      const res = await pb.collection('app_admins').getList(1, 1, { requestKey: null })
      isAdmin.value = res.totalItems > 0
    } catch (e) {
      isAdmin.value = false
    }
  }

  // --- Вызовы API админки ---
  const adminRequest = (path, options = {}) => pb.send(`/api/admin${path}`, { requestKey: null, ...options })

  const saveSetting = async (key, value) => {
    const res = await adminRequest('/settings', { method: 'PUT', body: { key, value } })
    applySetting(res.key, res.value)
    return res.value
  }

  return {
    registrationOpen,
    voiceInputEnabled,
    announcement,
    isAdmin,
    fetchConfig,
    checkAdmin,
    adminRequest,
    saveSetting
  }
})
