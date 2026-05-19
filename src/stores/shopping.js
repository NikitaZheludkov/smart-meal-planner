import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
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

    // 1. Оптимистичное обновление
    const wasChecked = checkedIds.value.has(productId)
    
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
      alert('Не удалось обновить статус')
      
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
      .neq('id', '00000000-0000-0000-0000-000000000000') 
    
    if (error) {
      console.error('Ошибка очистки списка:', error)
      alert('Не удалось очистить список')
    } else {
        alert('Список очищен')
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
        if (item.dish_id && !item.dishes) return false
        if (item.product_id && !item.products) return false
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

        if (planItem.dish_id) {
            const dishId = planItem.dish_id
            if (!dishesMap[dishId]) {
                dishesMap[dishId] = {
                    name: planItem.dishes?.name,
                    is_batch: planItem.dishes?.is_batch,
                    batch_yield: planItem.dishes?.batch_yield || 1,
                    ingredients: planItem.dishes?.ingredients || [],
                    totalPortions: 0
                }
            }
            dishesMap[dishId].totalPortions += portions
        } 
        else if (planItem.product_id) {
             addToAggregatedList(finalList, planItem.products, portions, 'Отдельно')
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
            if (!ing.products) return 
            addToAggregatedList(finalList, ing.products, (ing.amount || 0) * multiplier, dish.name)
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
        if (!item.dish_id || !item.dishes) return
        
        const dishId = item.dishes.id
        
        if (dishesMap.has(dishId)) {
            dishesMap.get(dishId).count++
        } else {
            const ingredients = item.dishes.ingredients || []
            let totalIngs = 0
            let foundIngs = 0
            
            ingredients.forEach(ing => {
                if (!ing.products) return
                totalIngs++
                if (checkedIds.value.has(ing.product_id)) {
                    foundIngs++
                }
            })
            
            const percent = totalIngs > 0 ? (foundIngs / totalIngs) * 100 : 100
            
            dishesMap.set(dishId, {
                id: dishId,
                name: item.dishes.name,
                image_url: item.dishes.image_url,
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
