import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  const fetchDishes = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    const { data, error } = await supabase
      .from('dishes')
      .select(`
        *,
        dish_tag_links (
          dish_tags ( * )
        ),
        ingredients (
          product_id,
          amount,
          products ( name, unit )
        )
      `)
      .eq('household_id', auth.householdId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      dishes.value = data.map(dish => ({
        ...dish,
        // Собираем теги
        tags: dish.dish_tag_links 
          ? dish.dish_tag_links.map(link => link.dish_tags).filter(t => t) 
          : [],
        // Собираем ингредиенты
        ingredients: dish.ingredients 
          ? dish.ingredients.map(ing => ({
              product_id: ing.product_id,
              name: ing.products?.name || 'Неизвестно',
              amount: ing.amount,
              unit: ing.products?.unit || ''
            }))
          : []
      }))
    }
    loading.value = false
  }

  const addDish = async (dishData) => {
    const auth = useAuthStore()
    
    // 1. Создаем (НОВЫЕ ПОЛЯ dish_type, meal_type)
    const { data: newDish, error } = await supabase
      .from('dishes')
      .insert({
        name: dishData.name,
        dish_type: dishData.dish_type, // Основное/Закуска...
        meal_type: dishData.meal_type, // Обед/Ужин...
        description: dishData.description || '',
        kcal: dishData.kcal || 0,
        protein: dishData.protein || 0,
        fat: dishData.fat || 0,
        carbs: dishData.carbs || 0,
        household_id: auth.householdId
      })
      .select()
      .single()

    if (error) { console.error(error); return }

    // 2. Теги
    if (dishData.tags && dishData.tags.length > 0) {
       const links = dishData.tags.map(tag => ({
           dish_id: newDish.id,
           tag_id: tag.id
       }))
       await supabase.from('dish_tag_links').insert(links)
    }

    // 3. Ингредиенты
    if (dishData.ingredients && dishData.ingredients.length > 0) {
        const ingRows = dishData.ingredients.map(ing => ({
            dish_id: newDish.id,
            product_id: ing.product_id,
            amount: parseFloat(ing.amount)
        }))
        await supabase.from('ingredients').insert(ingRows)
    }

    await fetchDishes()
  }

  const updateDish = async (id, dishData) => {
    // 1. Обновляем (НОВЫЕ ПОЛЯ)
    const { error } = await supabase
      .from('dishes')
      .update({
        name: dishData.name,
        dish_type: dishData.dish_type,
        meal_type: dishData.meal_type,
        description: dishData.description,
        kcal: dishData.kcal,
        protein: dishData.protein,
        fat: dishData.fat,
        carbs: dishData.carbs
      })
      .eq('id', id)

    if (error) { console.error(error); return }

    // 2. Теги (удалить старые -> добавить новые)
    await supabase.from('dish_tag_links').delete().eq('dish_id', id)
    if (dishData.tags && dishData.tags.length > 0) {
        const links = dishData.tags.map(tag => ({ dish_id: id, tag_id: tag.id }))
        await supabase.from('dish_tag_links').insert(links)
    }

    // 3. Ингредиенты (удалить -> добавить)
    await supabase.from('ingredients').delete().eq('dish_id', id)
    if (dishData.ingredients && dishData.ingredients.length > 0) {
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