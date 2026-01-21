import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useShoppingStore = defineStore('shopping', () => {
  // Храним ID купленных продуктов в Set для мгновенного доступа O(1)
  const checkedIds = ref(new Set())
  const loading = ref(false)

  // Загрузка состояния из базы
  const fetchChecklist = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    // ИСПРАВЛЕНО: используем shopping_cart согласно структуре БД
    const { data, error } = await supabase
      .from('shopping_cart')
      .select('product_id')
      .eq('household_id', auth.householdId)
      .eq('is_checked', true)

    if (error) {
      console.error('Ошибка загрузки списка покупок:', error)
    } else {
      // Превращаем массив объектов [{product_id: 1}, {product_id: 2}] в Set(1, 2)
      checkedIds.value = new Set(data.map(item => item.product_id))
    }
    loading.value = false
  }

  // Переключение галочки
  const toggleProduct = async (productId, newState) => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    // 1. Оптимистичное обновление интерфейса (мгновенно)
    if (newState) {
      checkedIds.value.add(productId)
    } else {
      checkedIds.value.delete(productId)
    }

    // 2. Отправка в базу
    // ИСПРАВЛЕНО: используем shopping_cart согласно структуре БД
    const { error } = await supabase
      .from('shopping_cart')
      .upsert({ 
        household_id: auth.householdId, 
        product_id: productId, 
        is_checked: newState,
        // user_id желательно тоже добавлять, если есть в таблице, но пока household критичнее
        updated_at: new Date()
      }, { onConflict: 'household_id, product_id' }) // Уточняем конфликт, если нужно

    if (error) console.error('Ошибка сохранения галочки:', error)
  }

  // Проверка: куплен ли продукт?
  const isChecked = (productId) => {
    return checkedIds.value.has(productId)
  }

  // Сброс списка (например, начало новой недели)
  const clearList = async () => {
      const auth = useAuthStore()
      if (!auth.householdId) return
      
      // Чистим локально
      checkedIds.value.clear()
      
      // Чистим в базе
      await supabase
          .from('shopping_cart')
          .delete()
          .eq('household_id', auth.householdId)
  }

  return { 
    checkedIds, 
    loading, 
    fetchChecklist, 
    toggleProduct, 
    isChecked,
    clearList
  }
})