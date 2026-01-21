import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  // Дефолтные значения (используются, пока грузится база или если произошла ошибка)
  const startDay = ref(1) 
  const periodLength = ref(7)
  const defaultPortions = ref(1)
  
  // --- 1. ЗАГРУЗКА (Строго из БД) ---
  const fetchSettings = async () => {
    const auth = useAuthStore()
    
    // Если пользователя нет - оставляем дефолт
    if (!auth.user) return

    try {
      // Делаем прямой запрос в базу
      const { data, error } = await supabase
        .from('profiles')
        .select('start_day, period_length, default_portions')
        .eq('id', auth.user.id)
        .single()

      if (error) throw error

      if (data) {
        // Применяем настройки ТОЛЬКО если они пришли из базы
        if (data.start_day !== null) startDay.value = data.start_day
        if (data.period_length !== null) periodLength.value = data.period_length
        if (data.default_portions !== null) defaultPortions.value = data.default_portions
        
        console.log('☁️ Настройки получены из БД')
      }
    } catch (e) {
      console.error('Ошибка получения настроек:', e)
      // Здесь можно добавить уведомление пользователю, что настройки не загрузились
    }
  }

  // --- 2. СОХРАНЕНИЕ (Отправка в БД -> Обновление UI) ---
  const saveSettings = async (day, period, portions) => {
    const auth = useAuthStore()

    if (auth.user) {
      const updates = {
          start_day: day,
          period_length: period,
          default_portions: portions
      }

      // Ждем подтверждения от базы
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', auth.user.id)

      if (error) {
          console.error('Ошибка сохранения:', error)
          alert('Ошибка сохранения настроек. Проверьте интернет.')
          return // Не обновляем UI, если база не приняла изменения
      }
    }

    // Обновляем UI только если запрос прошел успешно (или если мы в оффлайн-режиме разработки)
    startDay.value = day
    periodLength.value = period
    defaultPortions.value = portions
    console.log('💾 Настройки сохранены в БД и применены')
  }

  return { startDay, periodLength, defaultPortions, fetchSettings, saveSettings }
})