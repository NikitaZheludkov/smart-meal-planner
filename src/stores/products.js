import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useProductStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  const fetchProducts = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    // Теперь нам не нужно джойнить таблицу категорий, имя категории лежит прямо внутри продукта
    const { data, error } = await supabase
      .from('products')
      .select('*') 
      .eq('household_id', auth.householdId)
      .order('name')
    
    if (error) console.error(error)
    else products.value = data
    loading.value = false
  }

  const addProduct = async (product) => {
    const auth = useAuthStore()
    
    // Подготавливаем объект для базы
    const productWithHouse = { 
        name: product.name,
        unit: product.unit,
        category: product.category, // Сохраняем строку (название категории)
        household_id: auth.householdId
    }

    const { data, error } = await supabase
        .from('products')
        .insert([productWithHouse])
        .select()
        .single()
    
    if (data) {
      products.value.push(data)
      products.value.sort((a, b) => a.name.localeCompare(b.name))
    } else if (error) {
        console.error(error)
    }
  }

  const updateProduct = async (product) => {
    const auth = useAuthStore()
    
    const updates = {
        name: product.name,
        unit: product.unit,
        category: product.category // Обновляем строку
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', product.id)
      .eq('household_id', auth.householdId)
      .select()
      .single()

    if (!error && data) {
      const index = products.value.findIndex(p => p.id === product.id)
      if (index !== -1) {
        products.value[index] = data
        products.value.sort((a, b) => a.name.localeCompare(b.name))
      }
    }
  }

  const deleteProduct = async (id) => {
    const auth = useAuthStore()
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('household_id', auth.householdId)
      
    if (!error) {
       products.value = products.value.filter(p => p.id !== id)
    }
  }

  return { products, loading, fetchProducts, addProduct, updateProduct, deleteProduct }
})