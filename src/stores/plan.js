import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useUIStore } from './ui'
import { withRetry, withTimeout } from '../lib/utils'

export const usePlanStore = defineStore('plan', () => {
  const plan = ref([])
  const loading = ref(false)

  const normalizeDate = (v) => {
    if (typeof v !== 'string') return v
    return v.length >= 10 ? v.slice(0, 10) : v
  }

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
        const data = await withRetry(async () => {
          return await withTimeout(
            pb.collection('plan').getFullList({
              filter: `household="${auth.householdId}"`,
              sort: 'date,meal_type',
              expand: 'meal_type,dish,product,dish.dish_type,dish.meal_type,dish.tags,dish.ingredients_via_dish,dish.ingredients_via_dish.product'
            }),
            20000
          )
        })

        plan.value = (data || []).map((item) => {
          const mealType = item.expand?.meal_type || null
          const dish = item.expand?.dish || null
          const product = item.expand?.product || null

          const dishData = dish
            ? {
                ...dish,
                dish_typeData: dish.expand?.dish_type || null,
                meal_typeData: dish.expand?.meal_type || null,
                tagsData: dish.expand?.tags || [],
                ingredients:
                  dish.expand?.ingredients_via_dish?.map((ing) => ({
                    product: ing.product,
                    productData: ing.expand?.product || null,
                    name: ing.expand?.product?.name || 'Неизвестно',
                    amount: ing.amount,
                    unit: ing.expand?.product?.unit || ''
                  })) || []
              }
            : null

          return {
            ...item,
            date: normalizeDate(item.date),
            slot: mealType?.name || 'Неизвестно',
            dishData,
            productData: product
          }
        })

        ui.addLog(`План загружен: ${plan.value.length} записей`)

    } catch (e) {
        console.error('Ошибка загрузки плана:', e)
        ui.addLog('Ошибка загрузки плана', 'error', e)
        alert('Ошибка загрузки плана')
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
      meal_type: slotId,
      household: auth.householdId,
      ignore_shopping: item.ignore_shopping || false,
      portions: finalPortions
    }

    if (item.type === 'dish') {
      payload.dish = item.id
    } else {
      payload.product = item.id
    }

    // Оптимистичное добавление
    const tempId = 'temp-' + Date.now() + Math.random()
    const optimisticItem = {
        ...payload,
        id: tempId,
        slot: '',
        dishData: item.type === 'dish' ? item : null,
        productData: item.type === 'product' ? item : null
    }
    
    plan.value.push(optimisticItem)

    const data = await withRetry(async () => {
        return await withTimeout(pb.collection('plan').create(payload), 15000)
    }).catch((e) => ({ error: e }))
        
    if (data?.error) {
        console.error('Ошибка сохранения:', data.error)
        ui.showToast('Не удалось сохранить в план', 'error')
        // Откат
        plan.value = plan.value.filter(p => p.id !== tempId)
    } else {
        // Обновляем временный ID на реальный
        const index = plan.value.findIndex(p => p.id === tempId)
        if (index !== -1) {
             plan.value[index] = {
                 ...plan.value[index],
                 ...data,
                 date: normalizeDate(data.date)
             }
        }
        if (!ui.isModalOpen) {
          ui.showToast('Добавлено в план', 'success', 1200)
        }
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

    const error = await withTimeout(
      pb.collection('plan').update(id, updates).then(() => null).catch((e) => e),
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

    const error = await pb.collection('plan').delete(id).then(() => null).catch((e) => e)
    
    if (error) {
      console.error('Ошибка удаления из плана:', error)
      ui.showToast('Не удалось удалить', 'error')
      
      // Откат
      plan.value = originalPlan
    } else {
      if (!ui.isModalOpen) {
        ui.showToast('Удалено из плана', 'success', 1200)
      }
      // Не вызываем fetchPlan(), данные уже обновлены
    }
  }

  return { plan, loading, fetchPlan, addToPlan, removeFromPlan, updatePlanItem }
})
