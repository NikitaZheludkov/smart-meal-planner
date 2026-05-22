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
      ui.showToast('Ошибка загрузки блюд', 'error')
    } finally {
      loading.value = false
    }
  }

  const addDish = async (dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
      ui.showToast('Ошибка авторизации', 'error')
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
      ui.showToast('Блюдо сохранено', 'success')
    } catch (err) {
      console.error(err)
      ui.showToast('Ошибка при создании блюда', 'error')
      throw err
    }
  }

  const updateDish = async (id, dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
      ui.showToast('Ошибка авторизации', 'error')
      throw new Error('Учётная запись не авторизована. Сохранение невозможно.')
    }

    try {
      const toNumber = (v) => {
        const n = typeof v === 'number' ? v : parseFloat(v)
        return Number.isFinite(n) ? n : 0
      }

      const normalizeDesiredIngredients = (ings) => {
        const byProduct = new Map()
        for (const ing of ings || []) {
          const product = ing?.product || null
          if (!product) continue
          const amount = toNumber(ing.amount)
          byProduct.set(product, (byProduct.get(product) || 0) + amount)
        }
        return byProduct
      }

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

      const [existingIngredients, desiredByProduct] = await Promise.all([
        withRetry(async () => {
          return await withTimeout(
            pb.collection('ingredients').getFullList({
              filter: `household="${auth.householdId}" && dish="${id}"`
            }),
            15000
          )
        }),
        Promise.resolve(normalizeDesiredIngredients(dishData.ingredients))
      ])

      const existingByProduct = new Map()
      const duplicateExistingIds = []
      for (const ing of existingIngredients || []) {
        const product = ing?.product || null
        if (!product) continue
        if (existingByProduct.has(product)) {
          if (ing?.id) duplicateExistingIds.push(ing.id)
          continue
        }
        existingByProduct.set(product, ing)
      }

      const toCreate = []
      const toUpdate = []
      const toDelete = []

      for (const [product, amount] of desiredByProduct.entries()) {
        const existing = existingByProduct.get(product) || null
        if (!existing?.id) {
          toCreate.push({
            household: auth.householdId,
            dish: id,
            product,
            amount
          })
          continue
        }

        const oldAmount = toNumber(existing.amount)
        if (Math.abs(oldAmount - amount) > 1e-9) {
          toUpdate.push({ id: existing.id, payload: { amount } })
        }
      }

      for (const [product, existing] of existingByProduct.entries()) {
        if (!desiredByProduct.has(product) && existing?.id) {
          toDelete.push(existing.id)
        }
      }

      const executeAll = async (ops) => {
        const results = await Promise.allSettled(ops)
        const rejected = results.filter((r) => r.status === 'rejected')
        return { ok: rejected.length === 0, rejectedCount: rejected.length, results }
      }

      const createOps = toCreate.map((row) =>
        withRetry(async () => {
          return await withTimeout(pb.collection('ingredients').create(row), 15000)
        })
      )

      const updateOps = toUpdate.map((u) =>
        withRetry(async () => {
          return await withTimeout(pb.collection('ingredients').update(u.id, u.payload), 15000)
        })
      )

      const createAndUpdate = await executeAll([...createOps, ...updateOps])
      if (!createAndUpdate.ok) {
        ui.addLog('Частичная ошибка синхронизации ингредиентов (create/update)', 'error', {
          dishId: id,
          create: toCreate.length,
          update: toUpdate.length,
          deletePlanned: toDelete.length,
          rejected: createAndUpdate.rejectedCount
        })
        throw new Error('Не удалось обновить ингредиенты (ошибка сети). Данные не удалялись, попробуйте ещё раз.')
      }

      const deleteOps = [...toDelete, ...duplicateExistingIds].map((ingId) =>
        withRetry(async () => {
          return await withTimeout(pb.collection('ingredients').delete(ingId), 15000)
        })
      )

      const deletes = await executeAll(deleteOps)
      if (!deletes.ok) {
        ui.addLog('Частичная ошибка синхронизации ингредиентов (delete)', 'warn', {
          dishId: id,
          deletePlanned: deleteOps.length,
          rejected: deletes.rejectedCount
        })
        ui.showToast('Блюдо обновлено, но часть старых ингредиентов не удалилась. Обновите позже.', 'warn')
      }

      const formattedDish = await fetchSingleDish(id)
      const idx = dishes.value.findIndex((d) => d.id === id)
      if (idx !== -1) dishes.value[idx] = formattedDish

      ui.showToast('Блюдо обновлено', 'success')
    } catch (e) {
      console.error('Ошибка при обновлении блюда:', e)
      ui.addLog('Ошибка при обновлении блюда', 'error', e)
      ui.showToast('Ошибка при обновлении', 'error')
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
      ui.showToast('Блюдо удалено', 'success')
    } catch (e) {
      console.error('Ошибка удаления блюда:', e)
      ui.addLog('Ошибка удаления блюда', 'error', e)
      ui.showToast('Не удалось удалить блюдо', 'error')
      await fetchDishes()
    }
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, deleteDish }
})
