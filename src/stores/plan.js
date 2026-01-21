import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const usePlanStore = defineStore('plan', () => {
  const plan = ref([])
  const loading = ref(false)

  const fetchPlan = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    
    try {
        const { data, error } = await supabase
        .from('plan')
        .select(`
            *,
            dishes (
            *,
            ingredients (
                product_id,
                amount,
                products ( * )
            )
            ),
            products ( * )
        `)
        .eq('household_id', auth.householdId)
        
        if (error) throw error
        plan.value = data || []

    } catch (e) {
        console.error('Ошибка загрузки плана:', e)
    } finally {
        // ЭТО САМОЕ ВАЖНОЕ ИСПРАВЛЕНИЕ:
        // Выключаем спиннер в любом случае
        loading.value = false
    }
  }

  const addToPlan = async (date, slotName, slotId, item) => {
    const auth = useAuthStore()
    
    const payload = {
      date,
      slot: slotName,
      household_id: auth.householdId,
      ignore_shopping: item.ignore_shopping || false 
    }

    if (item.type === 'dish') {
      payload.dish_id = item.id
      payload.portions = item.amount || 1
    } else {
      payload.product_id = item.id
      payload.portions = item.amount || 1
    }

    // Оптимистик UI
    const tempItem = { ...payload, id: 'temp_' + Date.now() }
    if (item.type === 'dish') tempItem.dishes = item
    else tempItem.products = item
    
    plan.value.push(tempItem)

    // Не включаем глобальный loading, чтобы не мигал весь интерфейс
    // просто отправляем запрос
    const { data, error } = await supabase
        .from('plan')
        .insert(payload)
        .select()
        .single()
        
    if (error) {
        console.error('Ошибка сохранения:', error)
        plan.value = plan.value.filter(i => i.id !== tempItem.id)
    } else {
        await fetchPlan()
    }
  }

  const updatePlanItem = async (id, updates) => {
    // Мгновенное обновление UI
    const index = plan.value.findIndex(i => i.id === id)
    if (index !== -1) {
        plan.value[index] = { ...plan.value[index], ...updates }
    }

    // Запрос
    const { error } = await supabase
      .from('plan')
      .update(updates)
      .eq('id', id)

    if (error) {
        console.error('Ошибка обновления:', error)
        await fetchPlan() // Откат при ошибке
    }
  }

  const removeFromPlan = async (id) => {
    plan.value = plan.value.filter(i => i.id !== id)
    
    const { error } = await supabase.from('plan').delete().eq('id', id)
    if (error) await fetchPlan()
  }

  return { plan, loading, fetchPlan, addToPlan, removeFromPlan, updatePlanItem }
})