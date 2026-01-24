import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useDictionariesStore = defineStore('dictionaries', () => {
  
  // Данные из базы
  const mealTypes = ref([]) 
  const dishTypes = ref([])
  const availableTags = ref([]) 
  
  // Локальные данные (категории продуктов для списка покупок)
  const productCategories = ref([
    { id: 'pcat_1', name: 'Овощи и фрукты' },
    { id: 'pcat_2', name: 'Молочные продукты' },
    { id: 'pcat_3', name: 'Мясо, птица, рыба' },
    { id: 'pcat_4', name: 'Бакалея и хлеб' },
    { id: 'pcat_5', name: 'Заморозка' },
    { id: 'pcat_6', name: 'Напитки' },
    { id: 'pcat_7', name: 'Бытовая химия' },
    { id: 'pcat_8', name: 'Разное' }
  ])

  const loading = ref(false)

  const fetchDictionaries = async () => {
    loading.value = true
    try {
      // 1. Приемы пищи (Завтрак, Обед...) - сортировка по порядку
      const { data: meals } = await supabase
        .from('meal_types')
        .select('*')
        .order('sort_order')
      
      if (meals) mealTypes.value = meals

      // 2. Типы блюд (Основные, Салаты...) - сортировка по важности (sort_order)
      const { data: dishes } = await supabase
        .from('dish_types')
        .select('*')
        .order('sort_order')
      
      if (dishes) dishTypes.value = dishes

      // 3. Теги (Быстро, ПП...) - сортировка по группам и порядку
      const { data: tags } = await supabase
          .from('dish_tags')
          .select('*')
          .order('sort_order')
      
      if (tags) availableTags.value = tags

    } catch (e) {
      console.error('Ошибка загрузки справочников:', e)
    } finally {
      loading.value = false
    }
  }

  // Хелперы для получения объектов по ID (чтобы не искать вручную в компонентах)
  const getMealTypeById = (id) => mealTypes.value.find(m => m.id === id)
  const getDishTypeById = (id) => dishTypes.value.find(d => d.id === id)

  return { 
    mealTypes,
    dishTypes,
    availableTags,
    productCategories, 
    loading, 
    fetchDictionaries,
    getMealTypeById,
    getDishTypeById
  }
})