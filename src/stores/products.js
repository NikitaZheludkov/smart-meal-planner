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
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('household_id', auth.householdId) // <--- ФИЛЬТР
      .order('name')
    
    if (error) console.error(error)
    else products.value = data
    loading.value = false
  }

  const addProduct = async (product) => {
    const auth = useAuthStore()
    const { id, ...newProduct } = product 
    const productWithHouse = { ...newProduct, household_id: auth.householdId }

    const { data, error } = await supabase.from('products').insert([productWithHouse]).select()
    
    if (data) {
      products.value.push(data[0])
      products.value.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  const updateProduct = async (product) => {
    const auth = useAuthStore()
    const { error } = await supabase
      .from('products')
      .update({ name: product.name, unit: product.unit })
      .eq('id', product.id)
      .eq('household_id', auth.householdId)

    if (!error) {
      const index = products.value.findIndex(p => p.id === product.id)
      if (index !== -1) {
        products.value[index] = { ...product }
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