import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useShoppingStore = defineStore('shopping', () => {
  const checkedIds = ref(new Set())
  const loading = ref(false)
  
  // Кэшированный список, чтобы не тормозить UI
  const shoppingListCache = ref([]) 

  const fetchChecklist = async () => {
    // RLS защищает данные, householdId не обязателен в фильтре, но нужен контекст
    const auth = useAuthStore()
    if (!auth.user) return

    loading.value = true
    const { data, error } = await supabase
      .from('shopping_cart')
      .select('product_id')
      .eq('is_checked', true)

    if (error) {
      console.error('Ошибка списка покупок:', error)
    } else {
      checkedIds.value = new Set(data.map(item => item.product_id))
    }
    loading.value = false
  }

  const toggleProduct = async (productId, newState) => {
    const auth = useAuthStore()
    
    // Оптимистик UI
    if (newState) checkedIds.value.add(productId)
    else checkedIds.value.delete(productId)

    // Запись в базу
    const { error } = await supabase
      .from('shopping_cart')
      .upsert({ 
        household_id: auth.householdId, 
        product_id: productId, 
        is_checked: newState,
        updated_at: new Date()
      }, { onConflict: 'household_id, product_id' })

    if (error) console.error('Ошибка сохранения:', error)
  }

  const clearList = async () => {
      const auth = useAuthStore()
      checkedIds.value.clear()
      await supabase.from('shopping_cart').delete().neq('id', '00000000-0000-0000-0000-000000000000') 
      // Примечание: RLS удалит только строки текущей семьи. 
      // neq - это хак, чтобы Supabase не ругался на отсутствие WHERE, если `delete()` пустой.
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