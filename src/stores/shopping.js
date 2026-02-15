import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useUIStore } from './ui'

export const useShoppingStore = defineStore('shopping', () => {
  const checkedIds = ref(new Set())
  const loading = ref(false)
  
  // Кэшированный список, чтобы не тормозить UI
  const shoppingListCache = ref([]) 
  const withTimeout = async (promise, ms) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  const fetchChecklist = async () => {
    // RLS защищает данные, householdId не обязателен в фильтре, но нужен контекст
    const auth = useAuthStore()
    if (!auth.user) return

    loading.value = true
    const { data, error } = await withTimeout(
      supabase
      .from('shopping_cart')
      .select('product_id')
      .eq('is_checked', true),
      7000
    )

    if (error) {
      console.error('Ошибка списка покупок:', error)
    } else {
      checkedIds.value = new Set(data.map(item => item.product_id))
    }
    loading.value = false
  }

  const toggleProduct = async (productId, newState) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) return

    // 1. Оптимистичное обновление (мгновенная реакция UI)
    const wasChecked = checkedIds.value.has(productId)
    
    // Применяем новое состояние
    if (newState) checkedIds.value.add(productId)
    else checkedIds.value.delete(productId)

    // 2. Отправка запроса
    const { error } = await withTimeout(
      supabase
        .from('shopping_cart')
        .upsert({ 
          household_id: auth.householdId, 
          product_id: productId, 
          is_checked: newState,
          updated_at: new Date()
        }, { onConflict: 'household_id, product_id' }),
      5000
    )

    // 3. Откат при ошибке
    if (error) {
      console.error('Ошибка сохранения:', error)
      ui.showToast('Не удалось обновить статус', 'error')
      
      // Возвращаем как было
      if (wasChecked) checkedIds.value.add(productId)
      else checkedIds.value.delete(productId)
    }
  }

  const clearList = async () => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) return

    const { error } = await supabase
      .from('shopping_cart')
      .delete()
      .eq('household_id', auth.householdId)
      // Дополнительно проверяем ID, чтобы случайно не удалить "системные" записи, если они появятся
      .neq('id', '00000000-0000-0000-0000-000000000000') 
    
    if (error) {
      console.error('Ошибка очистки списка:', error)
      ui.showToast('Не удалось очистить список', 'error')
    } else {
        ui.showToast('Список очищен', 'success')
    }

    checkedIds.value.clear()
    await fetchChecklist()
  }
  
  const isChecked = (id) => checkedIds.value.has(id)

  return { 
    checkedIds, 
    loading, 
    fetchChecklist, 
    toggleProduct, 
    isChecked,
    clearList
  }
})
