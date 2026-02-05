import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const usePlanStore = defineStore('plan', () => {
  const plan = ref([])
  const loading = ref(false)
  const withTimeout = async (promise, ms) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  const fetchPlan = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    const isFirstLoad = plan.value.length === 0
    if (isFirstLoad) loading.value = true
    
    try {
        const { data, error } = await withTimeout(
          supabase
        .from('plan')
        .select(`
            *,
            meal_types (id, name), 
            dishes (
                *,
                ingredients (
                    product_id, amount,
                    products ( * )
                )
            ),
            products ( * )
        `)
        .eq('household_id', auth.householdId),
        7000
        )
        
        if (error) throw error
        
        plan.value = data.map(item => ({
            ...item,
            slot: item.meal_types?.name || 'Неизвестно',
            slot_id: item.meal_type_id
        })) || []

    } catch (e) {
        console.error('Ошибка загрузки плана:', e)
    } finally {
        loading.value = false
    }
  }

  const addToPlan = async (date, slotId, item) => {
    const auth = useAuthStore()
    
    // Определяем порции
    const finalPortions = item.portions || item.amount || 1

    const payload = {
      date,
      meal_type_id: slotId,
      // slot: 'legacy' <--- УДАЛЕНО: Это вызывало ошибку, так как колонки slot в базе больше нет
      household_id: auth.householdId,
      ignore_shopping: item.ignore_shopping || false,
      portions: finalPortions
    }

    if (item.type === 'dish') {
      payload.dish_id = item.id
    } else {
      payload.product_id = item.id
    }

    // Оптимистичное добавление в интерфейс (временный ID)
    const tempItem = { ...payload, id: 'temp_' + Date.now() }
    // Подставляем объекты для корректного отображения сразу
    if (item.type === 'dish') tempItem.dishes = item
    else tempItem.products = item
    
    plan.value.push(tempItem)

    // Отправка в базу
    const { error } = await supabase
        .from('plan')
        .insert(payload)
        .select()
        .single()
        
    if (error) {
        console.error('Ошибка сохранения:', error)
        // Если ошибка - удаляем временный элемент
        plan.value = plan.value.filter(i => i.id !== tempItem.id)
        alert('Не удалось сохранить в план: ' + error.message)
    } else {
        await fetchPlan()
    }
  }

  const updatePlanItem = async (id, updates) => {
    const index = plan.value.findIndex(i => i.id === id)
    if (index !== -1) {
        plan.value[index] = { ...plan.value[index], ...updates }
    }

    const { error } = await supabase
      .from('plan')
      .update(updates)
      .eq('id', id)

    if (error) {
        console.error('Ошибка обновления:', error)
        await fetchPlan()
    }
  }

  const removeFromPlan = async (id) => {
    plan.value = plan.value.filter(i => i.id !== id)
    const { error } = await supabase.from('plan').delete().eq('id', id)
    if (error) await fetchPlan()
  }

  return { plan, loading, fetchPlan, addToPlan, removeFromPlan, updatePlanItem }
})
