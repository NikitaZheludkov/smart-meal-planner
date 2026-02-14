import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth' // <-- 1. Импортируем AuthStore
import { useDishStore } from './dishes'

import { useUIStore } from './ui'

export const useProductStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  // Загрузка продуктов
  const fetchProducts = async () => {
    loading.value = true
    const auth = useAuthStore()
    const ui = useUIStore() // <-- Импорт UI стора
    
    if (!auth.householdId) {
       ui.addLog('Нет householdId, пропускаем загрузку продуктов', 'warn')
       loading.value = false
       return
    }

    try {
        const { data, error } = await auth.withRetry(async () => {
          return await auth.withTimeout(
            supabase
              .from('products')
              .select('*')
              .eq('household_id', auth.householdId) // Явно фильтруем по семье
              .order('name'),
            15000
          )
        })
        
        if (error) throw error
        products.value = data || []
    } catch (e) {
        ui.addLog('Ошибка загрузки продуктов', 'error', e)
        products.value = [] 
    } finally {
        loading.value = false
    }
  }

  // Добавление продукта
  const addProduct = async (product) => {
    const auth = useAuthStore()
    if (!auth.householdId) {
        throw new Error('Учётная запись не авторизована или ID семьи не найден.')
    }

    const { data, error } = await auth.withRetry(async () => {
      return await auth.withTimeout(
        supabase
          .from('products')
          .insert([{
            name: product.name,
            category: product.category,
            unit: product.unit,
            household_id: auth.householdId
          }])
          .select()
          .single(),
        15000
      )
    })

    if (error) {
        console.error('Supabase insert error:', error)
        throw error
    }
    
    await fetchProducts() // <--- Заново загружаем список
    return data
  }

  // Обновление продукта
  const updateProduct = async (id, updates) => {
    const auth = useAuthStore()
    if (!auth.householdId) {
        throw new Error('Учётная запись не авторизована. Сохранение невозможно.')
    }

    const cleanUpdates = {
        name: updates.name,
        category: updates.category,
        unit: updates.unit
    }

    const { data, error } = await supabase
      .from('products')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    
    await fetchProducts()
    return data
  }

  // Удаление продукта
  const deleteProduct = async (id) => {
    const auth = useAuthStore()
    try {
      await supabase.from('plan').delete().eq('product_id', id).eq('household_id', auth.householdId)

      const dishStore = useDishStore()
      const dishesToUpdate = dishStore.dishes.filter(dish =>
        (dish.ingredients || []).some(ingredient => ingredient.product_id === id)
      )

      for (const dish of dishesToUpdate) {
        dish.ingredients = (dish.ingredients || []).filter(ingredient => ingredient.product_id !== id)
        await supabase
          .from('ingredients')
          .delete()
          .eq('dish_id', dish.id)
          .eq('product_id', id)
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('household_id', auth.householdId)
      if (error) throw error

      await fetchProducts()
      await dishStore.fetchDishes()
      return true
    } catch (e) {
      console.error('Ошибка удаления:', e)
      throw e
    }
  }

  return { 
    products, 
    loading, 
    fetchProducts, 
    addProduct, 
    deleteProduct,
    updateProduct
  }
})