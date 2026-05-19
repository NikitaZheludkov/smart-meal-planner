import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { withRetry, withTimeout } from '../lib/utils'

import { useUIStore } from './ui'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  // --- Helpers ---
  const formatDish = (dish) => ({
      ...dish,
      meal_types: dish.dish_meal_type_links?.map(link => link.meal_types).filter(Boolean) || [],
      meal_type_name: dish.dish_meal_type_links?.map(link => link.meal_types?.name).join(', '),
      dish_type_name: dish.dish_types?.name,
      tags: dish.dish_tag_links?.map(link => link.dish_tags).filter(t => t) || [],
      ingredients: dish.ingredients?.map(ing => ({
          product_id: ing.product_id,
          name: ing.products?.name || 'Неизвестно',
          amount: ing.amount,
          unit: ing.products?.unit || ''
      })) || []
  })

  const fetchSingleDish = async (id) => {
      const { data, error } = await withRetry(async () => {
          return await withTimeout(
              supabase
              .from('dishes')
              .select(`
                  *,
                  dish_meal_type_links ( meal_types (id, name) ),
                  dish_types (id, name),
                  dish_tag_links ( dish_tags ( * ) ),
                  ingredients (
                      product_id, amount,
                      products ( name, unit )
                  )
              `)
              .eq('id', id)
              .single(),
              15000
          )
      })
      if (error) throw error
      return formatDish(data)
  }

  const fetchDishes = async () => {
    // Если блюда уже загружены, не мигаем спиннером
    if (dishes.value.length === 0) loading.value = true
    const ui = useUIStore()

    try {
        const { data, error } = await withRetry(async () => {
            return await withTimeout(
                supabase
                .from('dishes')
                .select(`
                    *,
                    dish_meal_type_links ( meal_types (id, name) ),
                    dish_types (id, name),
                    dish_tag_links ( dish_tags ( * ) ),
                    ingredients (
                        product_id, amount,
                        products ( name, unit )
                    )
                `)
                .order('created_at', { ascending: false }),
                20000 // 20s timeout for fetching all dishes
            )
        })

        if (error) throw error

        dishes.value = data.map(formatDish)
        
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
    
    // 1. Создаем само блюдо (с обработкой дубликатов)
    let newDish = null

    try {
        const { data, error } = await withRetry(async () => {
            return await withTimeout(
                supabase
                .from('dishes')
                .insert({
                    name: dishData.name,
                    dish_type_id: dishData.dish_type_id, 
                    // meal_type_id removed
                    description: dishData.description || '',
                    kcal: dishData.kcal || 0,
                    protein: dishData.protein || 0,
                    fat: dishData.fat || 0,
                    carbs: dishData.carbs || 0,
                    is_batch: dishData.is_batch || false,
                    batch_yield: dishData.batch_yield || 1,
                    household_id: auth.householdId // <-- ВАЖНО: Добавили ID семьи
                })
                .select()
                .single(),
                15000
            )
        })
        
        if (error) throw error
        newDish = data

    } catch (err) {
        // Обработка дубликата (Postgres code 23505)
        if (err.code === '23505' || err.message?.includes('duplicate key')) {
             ui.addLog('Обнаружен дубликат блюда, пробуем восстановить...', 'warn')
             
             // Пытаемся найти существующее блюдо
             const { data: existing, error: findError } = await supabase
                .from('dishes')
                .select()
                .eq('household_id', auth.householdId)
                .eq('name', dishData.name)
                .single()
             
             if (findError || !existing) {
                 alert('Ошибка при создании: ' + (err.message || 'Duplicate'))
                 throw err 
             }
             
             newDish = existing
             
             // Чистим старые связи перед перезаписью
             try {
                await Promise.all([
                    supabase.from('dish_meal_type_links').delete().eq('dish_id', newDish.id),
                    supabase.from('dish_tag_links').delete().eq('dish_id', newDish.id),
                    supabase.from('ingredients').delete().eq('dish_id', newDish.id)
                ])
             } catch (cleanupErr) {
                 console.error('Ошибка очистки дубликата:', cleanupErr)
             }

        } else {
            console.error(err); 
            alert('Ошибка при создании блюда')
            throw err 
        }
    }

    try {
        // 2. Параллельное сохранение связей
        const relationPromises = []

        if (dishData.meal_type_ids?.length) {
            const links = dishData.meal_type_ids.map(id => ({ dish_id: newDish.id, meal_type_id: id }))
            relationPromises.push(withTimeout(supabase.from('dish_meal_type_links').insert(links), 10000))
        }

        if (dishData.tags?.length) {
            const links = dishData.tags.map(tag => ({ dish_id: newDish.id, tag_id: tag.id }))
            relationPromises.push(withTimeout(supabase.from('dish_tag_links').insert(links), 10000))
        }

        if (dishData.ingredients?.length) {
            const ingRows = dishData.ingredients.map(ing => ({
                dish_id: newDish.id,
                product_id: ing.product_id,
                amount: parseFloat(ing.amount)
            }))
            relationPromises.push(withTimeout(supabase.from('ingredients').insert(ingRows), 10000))
        }

        if (relationPromises.length > 0) {
            await Promise.all(relationPromises)
        }

    } catch (relationError) {
        console.error('Ошибка при сохранении связей блюда:', relationError)
        ui.addLog('Ошибка при сохранении ингредиентов/тегов', 'warn', relationError)
        
        if (relationError.code === '23505') {
             alert('Блюдо сохранено (дубликаты связей пропущены)')
        } else {
             alert('Блюдо создано, но возможны ошибки в связях')
        }
    }

    // 3. Быстрое обновление локального состояния (без полной перезагрузки списка)
    try {
        const formattedDish = await fetchSingleDish(newDish.id)
        
        const existingIndex = dishes.value.findIndex(d => d.id === newDish.id)
        if (existingIndex !== -1) {
            dishes.value[existingIndex] = formattedDish 
        } else {
            dishes.value.unshift(formattedDish) 
        }
    } catch (fetchErr) {
        console.error('Ошибка при загрузке созданного блюда:', fetchErr)
        await fetchDishes()
    }

    alert('Блюдо сохранено')
  }

  const updateDish = async (id, dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
        alert('Ошибка авторизации')
        throw new Error('Учётная запись не авторизована. Сохранение невозможно.')
    }

    // 1. Обновляем основную информацию
    const { error } = await withRetry(async () => {
        return await withTimeout(
            supabase
            .from('dishes')
            .update({
                name: dishData.name,
                dish_type_id: dishData.dish_type_id,
                description: dishData.description,
                kcal: dishData.kcal,
                protein: dishData.protein,
                fat: dishData.fat,
                carbs: dishData.carbs,
                is_batch: dishData.is_batch || false,
                batch_yield: dishData.batch_yield || 1
            })
            .eq('id', id),
            15000
        )
    })

    if (error) { 
        console.error(error); 
        alert('Ошибка при обновлении')
        throw error
    }

    try {
        // 2. Параллельное обновление связей
        const updatePromises = []

        // Meal Types
        updatePromises.push((async () => {
             await withTimeout(supabase.from('dish_meal_type_links').delete().eq('dish_id', id), 5000)
             if (dishData.meal_type_ids?.length) {
                 const links = dishData.meal_type_ids.map(tid => ({ dish_id: id, meal_type_id: tid }))
                 await withTimeout(supabase.from('dish_meal_type_links').insert(links), 10000)
             }
        })())

        // Tags
        updatePromises.push((async () => {
             await withTimeout(supabase.from('dish_tag_links').delete().eq('dish_id', id), 5000)
             if (dishData.tags?.length) {
                 const links = dishData.tags.map(tag => ({ dish_id: id, tag_id: tag.id }))
                 await withTimeout(supabase.from('dish_tag_links').insert(links), 10000)
             }
        })())
        
        // Ingredients
        updatePromises.push((async () => {
             await withTimeout(supabase.from('ingredients').delete().eq('dish_id', id), 5000)
             if (dishData.ingredients?.length) {
                 const ingRows = dishData.ingredients.map(ing => ({
                     dish_id: id,
                     product_id: ing.product_id,
                     amount: parseFloat(ing.amount)
                 }))
                 await withTimeout(supabase.from('ingredients').insert(ingRows), 10000)
             }
        })())

        await Promise.all(updatePromises)

    } catch (relationError) {
        console.error('Ошибка при обновлении связей:', relationError)
        ui.addLog('Ошибка при обновлении связей', 'warn', relationError)
    }

    // 3. Локальное обновление
    try {
        const formattedDish = await fetchSingleDish(id)
        const idx = dishes.value.findIndex(d => d.id === id)
        if (idx !== -1) dishes.value[idx] = formattedDish
    } catch (e) {
        console.error('Ошибка при обновлении локального блюда', e)
        await fetchDishes()
    }

    alert('Блюдо обновлено')
  }

  const deleteDish = async (id) => {
    const ui = useUIStore()
    
    try {
        // Parallel delete
        await Promise.all([
            withTimeout(supabase.from('plan').delete().eq('dish_id', id), 10000),
            withTimeout(supabase.from('dishes').delete().eq('id', id), 10000)
        ])
        
        // Local update ONLY
        dishes.value = dishes.value.filter(d => d.id !== id)
        alert('Блюдо удалено')
        
    } catch (e) {
        console.error('Ошибка удаления блюда:', e)
        alert('Не удалось удалить блюдо')
        // Если ошибка - лучше перегрузить список для синхронизации
        await fetchDishes()
    }
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, deleteDish }
})
