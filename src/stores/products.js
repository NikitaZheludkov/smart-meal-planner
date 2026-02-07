import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth' // <-- 1. Импортируем AuthStore
import { useDishStore } from './dishes'

export const useProductStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  // Загрузка продуктов
  const fetchProducts = async () => {
    loading.value = true
    try {
        // Запрос был упрощен. RLS на стороне Supabase сама обеспечит фильтрацию по household_id.
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name')
        
        if (error) throw error
        products.value = data || []
    } catch (e) {
        console.error('Ошибка загрузки продуктов:', e)
        products.value = [] 
    } finally {
        loading.value = false
    }
  }

  // Добавление продукта
  const addProduct = async (product) => {
    const auth = useAuthStore()
    if (!auth.householdId) {
        console.error('Нет householdId, сохранение невозможно')
        throw new Error('householdId_missing')
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{
        name: product.name,
        category: product.category,
        unit: product.unit,
        household_id: auth.householdId
      }])
      .select()
      .single()

    if (error) throw error
    
    await fetchProducts() // <--- Заново загружаем список
    return data
  }

  // Обновление продукта
  const updateProduct = async (id, updates) => {
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