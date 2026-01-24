import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useDictionariesStore = defineStore('dictionaries', () => {
  
  // Справочники теперь храним как объекты: [{ id: '...', name: '...' }]
  const mealTypes = ref([]) 
  const dishTypes = ref([])
  
  // Категории продуктов оставляем локально, если для них нет таблицы в БД
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

  const availableTags = ref([]) 
  const loading = ref(false)

  const fetchDictionaries = async () => {
    loading.value = true
    try {
      // 1. Грузим типы приемов пищи
      const { data: meals } = await supabase
        .from('meal_types')
        .select('*')
        .order('sort_order')
      if (meals) mealTypes.value = meals

      // 2. Грузим типы блюд
      const { data: dishes } = await supabase
        .from('dish_types')
        .select('*')
        .order('name')
      if (dishes) dishTypes.value = dishes

      // 3. Грузим теги (безопасно через RLS, household_id не нужен в фильтре)
      const { data: tags } = await supabase
          .from('dish_tags')
          .select('*')
          .order('name')
      if (tags) availableTags.value = tags

    } catch (e) {
      console.error('Ошибка справочников:', e)
    } finally {
      loading.value = false
    }
  }

  // Хелпер: найти объект по ID
  const getMealTypeById = (id) => mealTypes.value.find(m => m.id === id)
  const getDishTypeById = (id) => dishTypes.value.find(d => d.id === id)

  return { 
    mealTypes,
    dishTypes,
    productCategories, 
    availableTags, 
    loading, 
    fetchDictionaries,
    getMealTypeById,
    getDishTypeById
  }
})