import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useDictionariesStore = defineStore('dictionaries', () => {
  
  // 1. ЖЕСТКО ЗАФИКСИРОВАННЫЕ КОНСТАНТЫ (Как ты просил)
  
  // Типы приема пищи (для привязки блюда и для слотов плана)
  const mealTypes = [
    'Завтрак', 
    'Обед', 
    'Ужин', 
    'Перекус'
  ]

  // Типы блюд
  const dishTypes = [
    'Основные', 
    'Закуски', 
    'Гарнир', 
    'Прочие'
  ]

  // Справочник для слотов планировщика (совпадает с mealTypes)
  const mealSlots = ref([
    { id: 'slot_1', name: 'Завтрак', sort_order: 1 },
    { id: 'slot_2', name: 'Обед', sort_order: 2 },
    { id: 'slot_3', name: 'Ужин', sort_order: 3 },
    { id: 'slot_4', name: 'Перекус', sort_order: 4 }
  ])

  // Категории продуктов (оставляем как было, это другая сущность)
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
  
  // Теги (загружаются из БД)
  const availableTags = ref([]) 
  const loading = ref(false)

  // --- ЗАГРУЗКА ТЕГОВ ---
  const fetchDictionaries = async () => {
    const auth = useAuthStore()
    if (!auth.householdId) return

    loading.value = true
    try {
      const { data } = await supabase
          .from('dish_tags')
          .select('*')
          .eq('household_id', auth.householdId)
          .order('name')

      availableTags.value = data || []

    } catch (e) {
      console.error('Ошибка справочников:', e)
    } finally {
      loading.value = false
    }
  }

  return { 
    mealTypes,
    dishTypes,
    mealSlots, 
    productCategories, 
    availableTags, 
    loading, 
    fetchDictionaries 
  }
})