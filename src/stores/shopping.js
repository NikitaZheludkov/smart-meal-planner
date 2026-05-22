import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useUIStore } from './ui'
import { usePlanStore } from './plan'
import { useSettingsStore } from './settings'
import { addDays, parseISO, isWithinInterval } from 'date-fns'

export const useShoppingStore = defineStore('shopping', () => {
  const checkedIds = ref(new Set())
  const loading = ref(false)
  
  const withTimeout = async (promise, ms) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([promise, t])
  }

  const fetchChecklist = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    try {
      const rows = await withTimeout(
        pb.collection('shopping_cart').getFullList({
          filter: `household="${auth.householdId}" && is_checked=true`
        }),
        15000
      )
      checkedIds.value = new Set((rows || []).map((r) => r.product).filter(Boolean))
    } catch (e) {
      console.error('Ошибка списка покупок:', e)
    }
    loading.value = false
  }

  const upsertShoppingRow = async (household, product, isChecked) => {
    const now = new Date().toISOString()
    const payload = { household, product, is_checked: isChecked, updated_at: now }

    let existing = null
    try {
      existing = await withTimeout(
        pb.collection('shopping_cart').getFirstListItem(`household="${household}" && product="${product}"`, {
          fields: 'id'
        }),
        5000
      )
    } catch {
      existing = null
    }

    if (existing?.id) {
      return await withTimeout(pb.collection('shopping_cart').update(existing.id, payload), 5000)
    }

    return await withTimeout(pb.collection('shopping_cart').create(payload), 5000)
  }

  const toggleProduct = async (productId, newState) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) return

    // 1. Оптимистичное обновление
    const wasChecked = checkedIds.value.has(productId)
    
    if (newState) checkedIds.value.add(productId)
    else checkedIds.value.delete(productId)

    const error = await upsertShoppingRow(auth.householdId, productId, newState).then(() => null).catch((e) => e)

    if (error) {
      console.error('Ошибка сохранения:', error)
      ui.showToast('Не удалось обновить статус', 'error')
      
      if (wasChecked) checkedIds.value.add(productId)
      else checkedIds.value.delete(productId)
    }
  }

  const clearList = async () => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) return

    try {
      const rows = await withTimeout(
        pb.collection('shopping_cart').getFullList({
          filter: `household="${auth.householdId}"`
        }),
        15000
      )
      await Promise.all((rows || []).map((r) => pb.collection('shopping_cart').delete(r.id).catch(() => null)))
      ui.showToast('Список очищен', 'success')
    } catch (e) {
      console.error('Ошибка очистки списка:', e)
      ui.showToast('Не удалось очистить список', 'error')
    }

    checkedIds.value.clear()
    await fetchChecklist()
  }
  
  const isChecked = (id) => checkedIds.value.has(id)

  // --- ВЫЧИСЛЕНИЕ СПИСКА ПОКУПОК ---
  // Перенесено из ShoppingView для централизации и синхронизации
  const shoppingList = computed(() => {
    const planStore = usePlanStore()
    const settingsStore = useSettingsStore()
    const uiStore = useUIStore()

    // Определяем период
    let start = uiStore.plan.currentWeekStart ? new Date(uiStore.plan.currentWeekStart) : new Date()
    if (isNaN(start.getTime())) start = new Date()
    
    const length = settingsStore.periodLength || 7
    const end = addDays(start, length - 1)
    
    start.setHours(0,0,0,0)
    end.setHours(23,59,59,999)

    // 1. Фильтруем план
    const activePlanItems = planStore.plan.filter(item => {
        const planDate = parseISO(item.date)
        planDate.setHours(0,0,0,0)
        
        if (!isWithinInterval(planDate, { start, end })) return false
        if (item.ignore_shopping) return false
        if (item.dish && !item.dishData) return false
        if (item.product && !item.productData) return false
        return true
    })

    // 2. Агрегируем продукты
    const dishesMap = {} // Группировка по блюдам для расчета батчей
    const finalList = {} // Итоговый список продуктов
    
    const addToAggregatedList = (list, product, amount, dishName) => {
        if (!list[product.id]) {
            list[product.id] = {
                id: product.id,
                name: product.name,
                unit: product.unit,
                category: product.category || 'Разное',
                amount: 0,
                dishes: new Set()
            }
        }
        list[product.id].amount += amount
        if (dishName) list[product.id].dishes.add(dishName)
    }

    activePlanItems.forEach(planItem => {
        const portions = planItem.portions || 1

        if (planItem.dish) {
            const dishId = planItem.dish
            if (!dishesMap[dishId]) {
                dishesMap[dishId] = {
                    name: planItem.dishData?.name,
                    is_batch: planItem.dishData?.is_batch,
                    batch_yield: planItem.dishData?.batch_yield || 1,
                    ingredients: planItem.dishData?.ingredients || [],
                    totalPortions: 0
                }
            }
            dishesMap[dishId].totalPortions += portions
        } 
        else if (planItem.product) {
             addToAggregatedList(finalList, planItem.productData, portions, 'Отдельно')
        }
    })

    // Обрабатываем сгруппированные блюда
    Object.values(dishesMap).forEach(dish => {
        // Унифицированная логика: считаем количество готовок (батчей)
        // Если блюдо на 1 порцию (yield=1), то multiplier = totalPortions (кол-во порций)
        // Если блюдо на 6 порций (yield=6), то multiplier = ceil(totalPortions / 6)
        const yieldAmount = dish.batch_yield || 1
        const multiplier = Math.ceil(dish.totalPortions / yieldAmount)
        
        dish.ingredients.forEach(ing => {
            if (!ing.productData) return 
            addToAggregatedList(finalList, ing.productData, (ing.amount || 0) * multiplier, dish.name)
        })
    })

    return Object.values(finalList).map(item => ({
        ...item,
        dishes: Array.from(item.dishes)
    }))
  })

  // Статистика по блюдам (для прогресс-бара)
  const dishStats = computed(() => {
    const planStore = usePlanStore()
    const settingsStore = useSettingsStore()
    const uiStore = useUIStore()

    let start = uiStore.plan.currentWeekStart ? new Date(uiStore.plan.currentWeekStart) : new Date()
    if (isNaN(start.getTime())) start = new Date()
    
    const length = settingsStore.periodLength || 7
    const end = addDays(start, length - 1)
    start.setHours(0,0,0,0)
    end.setHours(23,59,59,999)

    const dishesMap = new Map()
    
    planStore.plan.forEach(item => {
        const planDate = parseISO(item.date)
        planDate.setHours(0,0,0,0)
        if (!isWithinInterval(planDate, { start, end })) return
        if (item.ignore_shopping) return
        if (!item.dish || !item.dishData) return
        
        const dishId = item.dishData.id
        
        if (dishesMap.has(dishId)) {
            dishesMap.get(dishId).count++
        } else {
            const ingredients = item.dishData.ingredients || []
            let totalIngs = 0
            let foundIngs = 0
            
            ingredients.forEach(ing => {
                if (!ing.product) return
                totalIngs++
                if (checkedIds.value.has(ing.product)) {
                    foundIngs++
                }
            })
            
            const percent = totalIngs > 0 ? (foundIngs / totalIngs) * 100 : 100
            
            dishesMap.set(dishId, {
                id: dishId,
                name: item.dishData.name,
                image_url: item.dishData.image_url,
                count: 1, 
                percent: percent
            })
        }
    })
    
    return Array.from(dishesMap.values())
  })

  return { 
    checkedIds, 
    loading, 
    fetchChecklist, 
    toggleProduct, 
    isChecked,
    clearList,
    shoppingList, // <-- Экспортируем вычисляемое свойство
    dishStats     // <-- Экспортируем статистику
  }
})
