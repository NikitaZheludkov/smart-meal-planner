import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useUIStore } from './ui'
import { withTimeout } from '../lib/utils'

export const usePlanStore = defineStore('plan', () => {
  const plan = ref([])
  const loading = ref(false)

  const fetchPlan = async () => {
    const auth = useAuthStore()
    const ui = useUIStore()
    
    if (!auth.householdId) {
        ui.addLog('fetchPlan пропущен: нет householdId', 'warn')
        return
    }

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
        20000
        )
        
        if (error) throw error
        
        plan.value = data.map(item => ({
            ...item,
            slot: item.meal_types?.name || 'Неизвестно',
            slot_id: item.meal_type_id
        })) || []

        ui.addLog(`План загружен: ${plan.value.length} записей`)

    } catch (e) {
        console.error('Ошибка загрузки плана:', e)
        ui.addLog('Ошибка загрузки плана', 'error', e)
        ui.showToast('Ошибка загрузки плана', 'error')
    } finally {
        loading.value = false
    }
  }

  const addToPlan = async (date, slotId, item) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
        ui.showToast('Сессия потеряна. Перезагрузите страницу.', 'error')
        throw new Error('Сессия потеряна. Перезагрузите страницу.')
    }
    
    const finalPortions = item.portions || item.amount || 1

    const payload = {
      date,
      meal_type_id: slotId,
      household_id: auth.householdId,
      ignore_shopping: item.ignore_shopping || false,
      portions: finalPortions
    }

    if (item.type === 'dish') {
      payload.dish_id = item.id
    } else {
      payload.product_id = item.id
    }

    const { error } = await supabase
        .from('plan')
        .insert(payload)
        
    if (error) {
        console.error('Ошибка сохранения:', error)
        ui.showToast('Не удалось сохранить в план', 'error')
    } else {
        await fetchPlan()
        ui.showToast('Добавлено в план', 'success')
    }
  }

  const updatePlanItem = async (id, updates) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) return

    // 1. Оптимистичное обновление
    const originalPlan = JSON.parse(JSON.stringify(plan.value))
    const item = plan.value.find(p => p.id === id)
    if (item) {
        Object.assign(item, updates)
    }

    const { error } = await withTimeout(
      supabase
        .from('plan')
        .update(updates)
        .eq('id', id),
      5000
    )

    if (error) {
        console.error('Ошибка обновления:', error)
        ui.showToast('Не удалось обновить', 'error')
        // Откат
        plan.value = originalPlan
    }
  }

  const removeFromPlan = async (id) => {
    const ui = useUIStore()
    
    // 1. Оптимистичное удаление
    const originalPlan = [...plan.value]
    const itemIndex = plan.value.findIndex(item => item.id === id)
    if (itemIndex > -1) {
        plan.value.splice(itemIndex, 1)
    }

    const { error } = await supabase.from('plan').delete().eq('id', id)
    
    if (error) {
      console.error('Ошибка удаления из плана:', error)
      ui.showToast('Не удалось удалить', 'error')
      
      // Откат
      plan.value = originalPlan
    } else {
      ui.showToast('Удалено из плана', 'success')
      // Не вызываем fetchPlan(), данные уже обновлены
    }
  }

  return { plan, loading, fetchPlan, addToPlan, removeFromPlan, updatePlanItem }
})
