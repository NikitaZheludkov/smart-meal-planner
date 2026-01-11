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
        .select('*, dishes(*, ingredients(*, products(*)))')
        .eq('household_id', auth.householdId) // <--- ФИЛЬТР
        .order('date')
      
      if (error) throw error
      plan.value = data
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  const addToPlan = async (date, slotName, dishId) => {
    const auth = useAuthStore()
    // Временный объект для быстрого отображения в UI
    const tempId = Date.now()
    const tempEntry = { id: tempId, date, slot: slotName, dish_id: dishId, dishes: { id: dishId, name: '...' } }
    plan.value.push(tempEntry)

    try {
      const { data, error } = await supabase
        .from('plan')
        .insert([{ 
            date, 
            slot: slotName, 
            dish_id: dishId, 
            portions: 1,
            household_id: auth.householdId // <--- ПРИВЯЗКА
        }])
        .select('*, dishes(*, ingredients(*, products(*)))')
      
      if (error) throw error
      
      // Заменяем временный объект на реальный из базы
      const idx = plan.value.findIndex(p => p.id === tempId)
      if (idx !== -1 && data) {
        plan.value[idx] = data[0]
      }
    } catch (e) {
      console.error(e)
      // Если ошибка - убираем из UI
      plan.value = plan.value.filter(p => p.id !== tempId)
    }
  }

  const removeFromPlan = async (id) => {
    const auth = useAuthStore()
    const prevPlan = [...plan.value]
    plan.value = plan.value.filter(p => p.id !== id)
    
    const { error } = await supabase
        .from('plan')
        .delete()
        .eq('id', id)
        .eq('household_id', auth.householdId) // <--- ЗАЩИТА
        
    if (error) plan.value = prevPlan
  }

  return { plan, loading, fetchPlan, addToPlan, removeFromPlan }
})