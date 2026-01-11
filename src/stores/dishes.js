import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useDishStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  // 1. ЗАГРУЗКА (Только моя семья)
  const fetchDishes = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select(`*, ingredients(id, amount, product_id, products(name, unit))`)
        .eq('household_id', auth.householdId) // <--- ФИЛЬТР
        .order('name')
      
      if (error) throw error
      dishes.value = data
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  // 2. ДОБАВЛЕНИЕ (Клеим стикер семьи)
  const addDish = async (dish) => {
    const auth = useAuthStore()
    const dishWithHouse = { ...dish, household_id: auth.householdId } 
    
    const { data, error } = await supabase.from('dishes').insert([dishWithHouse]).select()
    if (!error && data) {
      // Добавляем пустой массив ингредиентов, чтобы не было ошибки при отображении
      dishes.value.push({ ...data[0], ingredients: [] })
    }
  }

  // 3. ОБНОВЛЕНИЕ
  const updateDish = async (id, updates) => {
    const auth = useAuthStore()
    const { error } = await supabase
      .from('dishes')
      .update(updates)
      .eq('id', id)
      .eq('household_id', auth.householdId)

    if (!error) {
      const index = dishes.value.findIndex(d => d.id === id)
      if (index !== -1) dishes.value[index] = { ...dishes.value[index], ...updates }
    }
  }

  // 4. ИНГРЕДИЕНТЫ (Привязаны к блюду, а блюдо уже в семье)
  const addIngredient = async (dishId, productId, amount) => {
    const { data, error } = await supabase
      .from('ingredients')
      .insert([{ dish_id: dishId, product_id: productId, amount }])
      .select('*, products(name, unit)')

    if (!error && data) {
      const dish = dishes.value.find(d => d.id === dishId)
      if (dish) {
        if (!dish.ingredients) dish.ingredients = []
        dish.ingredients.push(data[0])
      }
    }
  }

  const removeIngredient = async (dishId, ingredientId) => {
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredientId)
    if (!error) {
      const dish = dishes.value.find(d => d.id === dishId)
      if (dish) dish.ingredients = dish.ingredients.filter(i => i.id !== ingredientId)
    }
  }

  return { dishes, loading, fetchDishes, addDish, updateDish, addIngredient, removeIngredient }
})