import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  const fetchDishes = async () => {
    // RLS сам отфильтрует данные, householdId в запросе не обязателен, но Auth нужен
    const auth = useAuthStore()
    if (!auth.user) return

    loading.value = true
    const { data, error } = await supabase
      .from('dishes')
      .select(`
        *,
        meal_types (id, name),
        dish_types (id, name),
        dish_tag_links ( dish_tags ( * ) ),
        ingredients (
          product_id, amount,
          products ( name, unit )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      dishes.value = data.map(dish => ({
        ...dish,
        // Маппинг для удобства UI
        meal_type_name: dish.meal_types?.name,
        dish_type_name: dish.dish_types?.name,
        tags: dish.dish_tag_links?.map(link => link.dish_tags).filter(t => t) || [],
        ingredients: dish.ingredients?.map(ing => ({
              product_id: ing.product_id,
              name: ing.products?.name || 'Неизвестно',
              amount: ing.amount,
              unit: ing.products?.unit || ''
            })) || []
      }))
    }
    loading.value = false
  }

  const addDish = async (dishData) => {
    const auth = useAuthStore()
    
    // Используем ID из формы
    const { data: newDish, error } = await supabase
      .from('dishes')
      .insert({
        name: dishData.name,
        dish_type_id: dishData.dish_type_id, 
        meal_type_id: dishData.meal_type_id, 
        description: dishData.description || '',
        kcal: dishData.kcal || 0,
        protein: dishData.protein || 0,
        fat: dishData.fat || 0,
        carbs: dishData.carbs || 0,
        household_id: auth.householdId // Нужно для INSERT, RLS проверит на соответствие
      })
      .select()
      .single()

    if (error) { console.error(error); return }

    // Сохранение тегов и ингредиентов (логика не меняется)
    if (dishData.tags?.length) {
       const links = dishData.tags.map(tag => ({ dish_id: newDish.id, tag_id: tag.id }))
       await supabase.from('dish_tag_links').insert(links)
    }

    if (dishData.ingredients?.length) {
        const ingRows = dishData.ingredients.map(ing => ({
            dish_id: newDish.id,
            product_id: ing.product_id,
            amount: parseFloat(ing.amount)
        }))
        await supabase.from('ingredients').insert(ingRows)
    }

    await fetchDishes()
  }

  // Обновление
  const updateDish = async (id, dishData) => {
    const { error } = await supabase
      .from('dishes')
      .update({
        name: dishData.name,
        dish_type_id: dishData.dish_type_id,
        meal_type_id: dishData.meal_type_id,
        description: dishData.description,
        kcal: dishData.kcal,
        protein: dishData.protein,
        fat: dishData.fat,
        carbs: dishData.carbs
      })
      .eq('id', id)

    if (error) { console.error(error); return }

    // Перезапись связей (тегов и ингредиентов)
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
  }

  const deleteDish = async (id) => {
    await supabase.from('dishes').delete().eq('id', id)
    await fetchDishes()
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, deleteDish }
})