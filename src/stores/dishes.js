import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pb } from '../lib/supabase'
import { useAuthStore } from './auth'
import { withRetry, withTimeout } from '../lib/utils'
import { useUIStore } from './ui'
import { useProductStore } from './products'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  const normalizeIngredient = (ing, productIndex) => {
    const productId = ing.product || null
    const product = productId ? productIndex.get(productId) : null
    return {
      product: productId,
      productData: product || null,
      name: product?.name || 'Неизвестно',
      amount: ing.amount,
      unit: product?.unit || ''
    }
  }

  const formatDish = (dish, ingredientsOverride = null) => {
    const ingredients = ingredientsOverride || []

    return {
      ...dish,
      meal_type: dish.meal_type || null,
      dish_type: dish.dish_type || null,
      tags: Array.isArray(dish.tags) ? dish.tags : [],
      ingredients
    }
  }

  const fetchSingleDish = async (id) => {
    const auth = useAuthStore()
    const productStore = useProductStore()
    if (productStore.products.length === 0) {
      await productStore.fetchProducts()
    }
    const productIndex = new Map((productStore.products || []).map((p) => [p.id, p]))

    const dish = await withRetry(async () => {
      return await withTimeout(pb.collection('dishes').getOne(id), 15000)
    })

    const ingredients = auth.householdId
      ? await withRetry(async () => {
          return await withTimeout(
            pb.collection('ingredients').getFullList({
              filter: `household="${auth.householdId}" && dish="${id}"`
            }),
            15000
          )
        })
      : []

    const normalizedIngredients = (ingredients || []).map((ing) => normalizeIngredient(ing, productIndex))
    return formatDish(dish, normalizedIngredients)
  }

  const fetchDishes = async () => {
    if (dishes.value.length === 0) loading.value = true
    const ui = useUIStore()
    const auth = useAuthStore()
    const productStore = useProductStore()
    if (productStore.products.length === 0) {
      await productStore.fetchProducts()
    }
    const productIndex = new Map((productStore.products || []).map((p) => [p.id, p]))

    if (!auth.householdId) {
      ui.addLog('fetchDishes пропущен: нет householdId', 'warn')
      loading.value = false
      return
    }

    try {
      const data = await withRetry(async () => {
        return await withTimeout(
          pb.collection('dishes').getFullList({
            filter: `household="${auth.householdId}"`,
            sort: '-created'
          }),
          20000
        )
      })

      const ingredients = await withRetry(async () => {
        return await withTimeout(
          pb.collection('ingredients').getFullList({
            filter: `household="${auth.householdId}"`
          }),
          20000
        )
      })

      const byDishId = new Map()
      for (const ing of ingredients || []) {
        const dishId = ing.dish || null
        if (!dishId) continue
        if (!byDishId.has(dishId)) byDishId.set(dishId, [])
        byDishId.get(dishId).push(normalizeIngredient(ing, productIndex))
      }

      dishes.value = (data || []).map((d) => formatDish(d, byDishId.get(d.id) || []))

      ui.addLog(`Загружено блюд: ${dishes.value.length}`)
    } catch (e) {
      console.error('Ошибка загрузки блюд:', e)
      ui.addLog('Ошибка загрузки блюд', 'error', e)
      alert('Ошибка загрузки блюд')
    } finally {
      loading.value = false
    }
  }

  const addDish = async (dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
      alert('Ошибка авторизации')
      throw new Error('Учётная запись не авторизована или ID семьи не найден. Попробуйте перезагрузить приложение.')
    }

    try {
      const dishPayload = {
        name: dishData.name,
        dish_type: dishData.dish_type || null,
        meal_type: dishData.meal_type || null,
        tags: Array.isArray(dishData.tags) ? dishData.tags : [],
        description: dishData.description || '',
        kcal: Number(dishData.kcal) || 0,
        protein: Number(dishData.protein) || 0,
        fat: Number(dishData.fat) || 0,
        carbs: Number(dishData.carbs) || 0,
        is_batch: dishData.is_batch || false,
        batch_yield: dishData.batch_yield || 1,
        household: auth.householdId
      }

      const newDish = await withRetry(async () => {
        return await withTimeout(pb.collection('dishes').create(dishPayload), 15000)
      })

      const ingRows = (dishData.ingredients || [])
        .filter((ing) => ing?.product)
        .map((ing) => ({
          household: auth.householdId,
          dish: newDish.id,
          product: ing.product,
          amount: parseFloat(ing.amount)
        }))

      if (ingRows.length) {
        await Promise.all(
          ingRows.map((row) =>
            withTimeout(pb.collection('ingredients').create(row), 10000).catch((e) => {
              ui.addLog('Ошибка при сохранении ингредиента', 'warn', e)
            })
          )
        )
      }

      const formattedDish = await fetchSingleDish(newDish.id)
      dishes.value.unshift(formattedDish)
      alert('Блюдо сохранено')
    } catch (err) {
      console.error(err)
      alert('Ошибка при создании блюда')
      throw err
    }
  }

  const updateDish = async (id, dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
      alert('Ошибка авторизации')
      throw new Error('Учётная запись не авторизована. Сохранение невозможно.')
    }

    try {
      const dishPayload = {
        name: dishData.name,
        dish_type: dishData.dish_type || null,
        meal_type: dishData.meal_type || null,
        tags: Array.isArray(dishData.tags) ? dishData.tags : [],
        description: dishData.description || '',
        kcal: Number(dishData.kcal) || 0,
        protein: Number(dishData.protein) || 0,
        fat: Number(dishData.fat) || 0,
        carbs: Number(dishData.carbs) || 0,
        is_batch: dishData.is_batch || false,
        batch_yield: dishData.batch_yield || 1
      }

      await withRetry(async () => {
        return await withTimeout(pb.collection('dishes').update(id, dishPayload), 15000)
      })

      const existingIngredients = await pb.collection('ingredients').getFullList({
        filter: `household="${auth.householdId}" && dish="${id}"`
      })
      await Promise.all(
        (existingIngredients || []).map((ing) =>
          withTimeout(pb.collection('ingredients').delete(ing.id), 5000).catch(() => null)
        )
      )

      const ingRows = (dishData.ingredients || [])
        .filter((ing) => ing?.product)
        .map((ing) => ({
          household: auth.householdId,
          dish: id,
          product: ing.product,
          amount: parseFloat(ing.amount)
        }))

      if (ingRows.length) {
        await Promise.all(
          ingRows.map((row) =>
            withTimeout(pb.collection('ingredients').create(row), 10000).catch((e) => {
              ui.addLog('Ошибка при сохранении ингредиента', 'warn', e)
            })
          )
        )
      }

      const formattedDish = await fetchSingleDish(id)
      const idx = dishes.value.findIndex((d) => d.id === id)
      if (idx !== -1) dishes.value[idx] = formattedDish

      alert('Блюдо обновлено')
    } catch (e) {
      console.error('Ошибка при обновлении блюда:', e)
      ui.addLog('Ошибка при обновлении блюда', 'error', e)
      alert('Ошибка при обновлении')
      throw e
    }
  }

  const deleteDish = async (id) => {
    const ui = useUIStore()
    const auth = useAuthStore()

    try {
      if (auth.householdId) {
        const planItems = await pb.collection('plan').getFullList({
          filter: `dish="${id}" && household="${auth.householdId}"`
        })
        await Promise.all((planItems || []).map((p) => withTimeout(pb.collection('plan').delete(p.id), 10000)))
      }

      await withTimeout(pb.collection('dishes').delete(id), 10000)
      dishes.value = dishes.value.filter((d) => d.id !== id)
      alert('Блюдо удалено')
    } catch (e) {
      console.error('Ошибка удаления блюда:', e)
      ui.addLog('Ошибка удаления блюда', 'error', e)
      alert('Не удалось удалить блюдо')
      await fetchDishes()
    }
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, deleteDish }
})
