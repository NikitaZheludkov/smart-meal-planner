import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
    { id: 'pcat_4', name: 'Хлеб' },
    { id: 'pcat_5', name: 'Крупы, макароны' },
    { id: 'pcat_6', name: 'Соусы' },
    { id: 'pcat_7', name: 'Разное' },
    { id: 'pcat_8', name: 'Напитки' },
    { id: 'pcat_9', name: 'Бытовая химия' }
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

  // У блюда обед и ужин — одна категория «Обед/Ужин»: одни и те же блюда
  // подходят на оба приёма. В сетке плана они остаются разными ячейками,
  // а в блюде хранятся оба id (это же делает хук на сервере).
  const dishMealTypes = computed(() => {
    const lunch = mealTypes.value.find((m) => m.name === 'Обед')
    const dinner = mealTypes.value.find((m) => m.name === 'Ужин')
    const list = []
    for (const m of mealTypes.value) {
      if (lunch && dinner && m === dinner) continue
      list.push(lunch && dinner && m === lunch
        ? { id: lunch.id, name: 'Обед/Ужин', ids: [lunch.id, dinner.id] }
        : { id: m.id, name: m.name, ids: [m.id] })
    }
    return list
  })
  // Категория блюда, к которой относится приём пищи (для ужина — «Обед/Ужин»)
  const getDishMealType = (id) => dishMealTypes.value.find((g) => g.ids.includes(id))
  // id приёмов пищи вместе с парой: [Обед] -> [Обед, Ужин], в порядке справочника
  const withMealPairs = (ids = []) => {
    const all = new Set((ids || []).flatMap((id) => getDishMealType(id)?.ids || [id]))
    return mealTypes.value.map((m) => m.id).filter((id) => all.has(id))
  }
  // Подходит ли блюдо в ячейку плана (в ужин — любые блюда «Обед/Ужин»)
  const dishFitsSlot = (dish, slotId) => {
    const ids = getDishMealType(slotId)?.ids || [slotId]
    return (dish?.meal_type || []).some((id) => ids.includes(id))
  }
  // Категории блюда без повторов: «Завтрак · Обед/Ужин»
  const dishMealTypeNames = (ids = []) => dishMealTypes.value
    .filter((g) => g.ids.some((id) => (ids || []).includes(id)))
    .map((g) => g.name)

  return { 
    mealTypes,
    dishTypes,
    availableTags,
    productCategories, 
    loading, 
    fetchDictionaries,
    getMealTypeById,
    getDishTypeById,
    dishMealTypes,
    getDishMealType,
    withMealPairs,
    dishFitsSlot,
    dishMealTypeNames
  }
})
