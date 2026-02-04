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
        const auth = useAuthStore()
        let attempts = 0
        while (!auth.householdId && attempts < 30) {
          await new Promise(r => setTimeout(r, 200))
          attempts++
        }
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('household_id', auth.householdId)
          .order('name')
        if (error) throw error
        products.value = data || []
    } catch (e) {
        console.error('Ошибка загрузки продуктов:', e)
        // Можно сбросить список при ошибке, чтобы не показывать старое
        products.value = [] 
    } finally {
        // <-- 2. ГАРАНТИРОВАННО выключаем спиннер
        loading.value = false
    }
  }

  // Добавление продукта
  const addProduct = async (product) => {
    const auth = useAuthStore() // Получаем текущего юзера
    
    // Если нет ID семьи, мы не можем создать продукт (защита RLS не пропустит)
    if (!auth.householdId) {
        console.error('Нет householdId, сохранение невозможно')
        return null
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{
        name: product.name,
        category: product.category,
        unit: product.unit,
        household_id: auth.householdId // <-- 3. ВАЖНО: Добавляем ID семьи
      }])
      .select()

    if (error) {
        console.error('Ошибка добавления:', error)
        return null
    }
    if (data) {
        products.value.push(data[0])
        products.value.sort((a, b) => a.name.localeCompare(b.name))
        return data[0]
    }
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

    if (error) {
        console.error('Ошибка обновления:', error)
        return
    }
    if (data) {
        const idx = products.value.findIndex(p => p.id === id)
        if (idx !== -1) products.value[idx] = data[0]
    }
  }

  // Удаление продукта
  const deleteProduct = async (id) => {
    // Delete the product from the plan table
    await supabase.from('plan').delete().eq('product_id', id);

    const dishStore = useDishStore()
    // Find all dishes that use the product
    const dishesToUpdate = dishStore.dishes.filter(dish =>
      dish.ingredients.some(ingredient => ingredient.product_id === id)
    );

    // Remove the product from the ingredients array of each dish
    for (const dish of dishesToUpdate) {
      dish.ingredients = dish.ingredients.filter(ingredient => ingredient.product_id !== id);
      // Update the ingredients table in the database
      await supabase
        .from('ingredients')
        .delete()
        .eq('dish_id', dish.id)
        .eq('product_id', id);
    }

    // Delete the product from the plan table
    await supabase.from('plan').delete().eq('product_id', id);

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
        console.error('Ошибка удаления:', error)
        return
    }
    products.value = products.value.filter(p => p.id !== id)
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
