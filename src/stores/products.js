import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useUIStore } from './ui'
import { withRetry, withTimeout } from '../lib/utils'

export const useProductStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  // Загрузка продуктов
  const fetchProducts = async () => {
    loading.value = true
    const auth = useAuthStore()
    const ui = useUIStore()
    
    if (!auth.householdId) {
       console.warn('Нет householdId, пропускаем загрузку продуктов')
       loading.value = false
       return
    }

    try {
        const data = await withRetry(async () => {
          return await withTimeout(
            pb.collection('products').getFullList({
              filter: `household="${auth.householdId}"`,
              sort: 'name'
            }),
            15000
          )
        })

        products.value = data || []
    } catch (e) {
        console.error('Ошибка загрузки продуктов:', e)
        ui.showToast('Ошибка загрузки продуктов', 'error')
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

    const data = await withRetry(async () => {
      return await withTimeout(
        pb.collection('products').create({
          name: product.name,
          category: product.category,
          unit: product.unit,
          household: auth.householdId
        }),
        15000
      )
    })
    
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

    const data = await withRetry(async () => {
      return await withTimeout(
        pb.collection('products').update(id, cleanUpdates),
        15000
      )
    })
    
    await fetchProducts()
    return data
  }

  // Удаление продукта
  const deleteProduct = async (id) => {
    const auth = useAuthStore()
    try {
      if (!auth.householdId) {
        throw new Error('Учётная запись не авторизована. Удаление невозможно.')
      }

      const planItems = await withRetry(async () => {
        return await withTimeout(
          pb.collection('plan').getFullList({
            filter: `product="${id}" && household="${auth.householdId}"`
          }),
          15000
        )
      })

      for (const item of planItems) {
        await withRetry(async () => {
          return await withTimeout(pb.collection('plan').delete(item.id), 15000)
        })
      }

      const ingredients = await withRetry(async () => {
        return await withTimeout(
          pb.collection('ingredients').getFullList({
            filter: `product="${id}" && household="${auth.householdId}"`
          }),
          15000
        )
      })

      for (const ingredient of ingredients) {
        await withRetry(async () => {
          return await withTimeout(pb.collection('ingredients').delete(ingredient.id), 15000)
        })
      }

      const productRecord = await withRetry(async () => {
        return await withTimeout(
          pb.collection('products').getFirstListItem(
            `id="${id}" && household="${auth.householdId}"`
          ),
          15000
        )
      })

      await withRetry(async () => {
        return await withTimeout(pb.collection('products').delete(productRecord.id), 15000)
      })

      await fetchProducts()
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
