import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUIStore } from './ui'
import { pb } from '../lib/supabase'
import { withRetry, withTimeout } from '../lib/utils'

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
    const ui = useUIStore()
    try {
      const [meals, dishes, tags] = await withRetry(async () => {
        return await withTimeout(
          Promise.all([
            pb.collection('meal_types').getFullList({ sort: 'sort_order' }),
            pb.collection('dish_types').getFullList({ sort: 'sort_order' }),
            pb.collection('dish_tags').getFullList({ sort: 'sort_order' })
          ]),
          15000
        )
      })

      mealTypes.value = meals || []
      dishTypes.value = dishes || []
      availableTags.value = tags || []
      
      ui.addLog('Справочники загружены')

    } catch (e) {
      console.error('Ошибка загрузки справочников:', e)
      ui.addLog('Ошибка справочников', 'error', e)
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
