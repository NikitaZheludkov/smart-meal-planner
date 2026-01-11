import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useShoppingStore = defineStore('shopping', () => {
  const list = ref([])
  const loading = ref(false)

  const generateList = async (startDate, endDate) => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    list.value = []

    try {
      // 1. Получаем План Семьи
      const { data: planData } = await supabase
        .from('plan')
        .select('dish_id')
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('household_id', auth.householdId)

      if (!planData || planData.length === 0) return

      const dishIds = planData.map(p => p.dish_id).filter(Boolean)
      if (dishIds.length === 0) return

      // 2. Получаем Ингредиенты
      const { data: ingredientsData } = await supabase
        .from('ingredients')
        .select('amount, product_id, products (id, name, unit)')
        .in('dish_id', dishIds)

      // 3. Получаем Галочки Семьи
      const { data: checksData } = await supabase
        .from('shopping_cart')
        .select('product_id')
        .eq('household_id', auth.householdId)

      const checkedIds = new Set(checksData?.map(c => c.product_id) || [])

      // 4. Считаем сумму
      const aggregated = {}
      ingredientsData?.forEach(item => {
        const prodId = item.product_id
        if (!aggregated[prodId]) {
          aggregated[prodId] = {
            id: prodId,
            name: item.products?.name,
            unit: item.products?.unit,
            amount: 0,
            checked: checkedIds.has(prodId)
          }
        }
        aggregated[prodId].amount += parseFloat(item.amount) || 0
      })

      list.value = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name))

    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  const toggleItem = async (id) => {
    const auth = useAuthStore()
    const item = list.value.find(i => i.id === id)
    if (!item) return
    
    item.checked = !item.checked

    if (item.checked) {
      await supabase.from('shopping_cart').insert([{ 
          product_id: id,
          household_id: auth.householdId 
      }])
    } else {
      await supabase.from('shopping_cart').delete()
          .eq('product_id', id)
          .eq('household_id', auth.householdId)
    }
  }

  return { list, loading, generateList, toggleItem }
})