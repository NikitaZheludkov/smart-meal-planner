import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useProductStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  // Загрузка продуктов
  const fetchProducts = async () => {
    loading.value = true
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')
    
    if (error) {
        console.error('Ошибка загрузки продуктов:', error)
    } else {
        products.value = data
    }
    loading.value = false
  }

  // Добавление продукта (Очищено от КБЖУ)
  const addProduct = async (product) => {
    // Получаем текущего пользователя для household_id (если нужно) 
    // или полагаемся на триггер базы данных (рекомендуется)
    
    const { data, error } = await supabase
      .from('products')
      .insert([{
        name: product.name,
        category: product.category,
        unit: product.unit
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