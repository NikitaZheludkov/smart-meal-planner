import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

import { useUIStore } from './ui'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  const fetchDishes = async () => {
    // Если блюда уже загружены, не мигаем спиннером
    if (dishes.value.length === 0) loading.value = true
    const ui = useUIStore()

    try {
        const { data, error } = await supabase
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
        .order('created_at', { ascending: false })

        if (error) throw error

        dishes.value = data.map(dish => ({
            ...dish,
            // Map the nested M2M structure to a flat array of meal types
            meal_types: dish.dish_meal_type_links?.map(link => link.meal_types).filter(Boolean) || [],
            // Keep backward compatibility for display if needed, but prefer the array
            meal_type_name: dish.dish_meal_type_links?.map(link => link.meal_types?.name).join(', '),
            dish_type_name: dish.dish_types?.name,
            tags: dish.dish_tag_links?.map(link => link.dish_tags).filter(t => t) || [],
            ingredients: dish.ingredients?.map(ing => ({
                product_id: ing.product_id,
                name: ing.products?.name || 'Неизвестно',
                amount: ing.amount,
                unit: ing.products?.unit || ''
                })) || []
        }))
        
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
    
    // 1. Создаем само блюдо
    const { data: newDish, error } = await supabase
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
      .single()

    if (error) { 
        console.error(error); 
        ui.showToast('Ошибка при создании блюда', 'error')
        return 
    }

    // 1.1 Привязываем типы приема пищи
    if (dishData.meal_type_ids?.length) {
        const links = dishData.meal_type_ids.map(id => ({ dish_id: newDish.id, meal_type_id: id }))
        await supabase.from('dish_meal_type_links').insert(links)
    }

    // 2. Привязываем теги (если есть)
    if (dishData.tags?.length) {
       const links = dishData.tags.map(tag => ({ dish_id: newDish.id, tag_id: tag.id }))
       await supabase.from('dish_tag_links').insert(links)
    }

    // 3. Привязываем ингредиенты (если есть)
    if (dishData.ingredients?.length) {
        const ingRows = dishData.ingredients.map(ing => ({
            dish_id: newDish.id,
            product_id: ing.product_id,
            amount: parseFloat(ing.amount)
        }))
        await supabase.from('ingredients').insert(ingRows)
    }

    await fetchDishes()
    ui.showToast('Блюдо создано', 'success')
  }

  const updateDish = async (id, dishData) => {
    const auth = useAuthStore()
    const ui = useUIStore()
    if (!auth.householdId) {
        ui.showToast('Ошибка авторизации', 'error')
        throw new Error('Учётная запись не авторизована. Сохранение невозможно.')
    }

    // При обновлении household_id не меняем, он уже есть в базе
    const { error } = await supabase
      .from('dishes')
      .update({
        name: dishData.name,
        dish_type_id: dishData.dish_type_id,
        // meal_type_id: dishData.meal_type_id, // Deprecated
        description: dishData.description,
        kcal: dishData.kcal,
        protein: dishData.protein,
        fat: dishData.fat,
        carbs: dishData.carbs,
        is_batch: dishData.is_batch || false,
        batch_yield: dishData.batch_yield || 1
      })
      .eq('id', id)

    if (error) { 
        console.error(error); 
        ui.showToast('Ошибка при обновлении', 'error')
        return 
    }

    // Обновляем связи Meal Types
    await supabase.from('dish_meal_type_links').delete().eq('dish_id', id)
    if (dishData.meal_type_ids?.length) {
        const mealLinks = dishData.meal_type_ids.map(tid => ({ 
            dish_id: id, 
            meal_type_id: tid 
        }))
        await supabase.from('dish_meal_type_links').insert(mealLinks)
    }

    // Обновляем связи (удаляем старые -> пишем новые)
    await supabase.from('dish_tag_links').delete().eq('dish_id', id)
    if (dishData.tags?.length) {
        const links = dishData.tags.map(tag => ({ dish_id: id, tag_id: tag.id }))
        await supabase.from('dish_tag_links').insert(links)
    }

    await supabase.from('ingredients').delete().eq('dish_id', id)
    if (dishData.ingredients?.length) {
        const ingRows = dishData.ingredients.map(ing => ({
            dish_id: id,
            product_id: ing.product_id,
            amount: parseFloat(ing.amount)
        }))
        await supabase.from('ingredients').insert(ingRows)
    }

    await fetchDishes()
    ui.showToast('Блюдо обновлено', 'success')
  }

  const deleteDish = async (id) => {
    const ui = useUIStore()
    // Delete the dish from the plan table
    await supabase.from('plan').delete().eq('dish_id', id);

    // Delete the dish from the dishes table
    const { error } = await supabase.from('dishes').delete().eq('id', id)

    if (error) {
        console.error(error)
        ui.showToast('Ошибка при удалении', 'error')
    } else {
        await fetchDishes()
        ui.showToast('Блюдо удалено', 'success')
    }
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, deleteDish }
})
