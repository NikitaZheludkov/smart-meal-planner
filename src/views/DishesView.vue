<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import { usePlatformStore } from '../stores/platform'
import DishDetailModal from '../components/DishDetailModal.vue'
import DishFilterModal from '../components/DishFilterModal.vue'

const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  }
})

const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const uiStore = useUIStore()
const platform = usePlatformStore()

// Анимация перелистывания
const transitionName = ref('slide-left')

// Получаем индекс приема пищи (все = 0)
const getMealTypeIndex = (id) => {
  if (id === null) return 0
  const index = dictionaries.mealTypes.findIndex(m => m.id === id)
  return index !== -1 ? index + 1 : 0
}

// Слушаем изменение activeTag для определения направления анимации
watch(() => uiStore.dishes.activeTag, (newId, oldId) => {
  const newIndex = getMealTypeIndex(newId)
  const oldIndex = getMealTypeIndex(oldId)
  transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right'
})

// Состояние модалок
const showDetailModal = ref(false)
const showFilterModal = ref(false)
const viewingDish = ref(null)
const tagById = computed(() => new Map((dictionaries.availableTags || []).map((t) => [t.id, t])))

// "Обед · Ужин · #Быстро · #Детское" — приёмы пищи и теги одной строкой
const cardMeta = (dish) => [
  ...(dish.meal_type || []).map((id) => dictionaries.getMealTypeById(id)?.name || '...'),
  ...(dish.tags || []).map((id) => tagById.value.get(id)?.name).filter(Boolean).map((n) => '#' + n)
].join(' · ')

const openDish = (dish) => {
  viewingDish.value = dish
  showDetailModal.value = true
}

const openCreateDish = () => {
  viewingDish.value = {
      id: null, 
      name: '',
      dish_type: uiStore.dishes.activeCategory !== 'all' ? uiStore.dishes.activeCategory : dictionaries.dishTypes[0]?.id, 
      meal_type: [uiStore.dishes.activeTag ? uiStore.dishes.activeTag : (dictionaries.mealTypes[1]?.id || dictionaries.mealTypes[0]?.id)].filter(Boolean),
      kcal: null, protein: null, fat: null, carbs: null,
      tags: [],
      ingredients: []
  }
  showDetailModal.value = true
}

const openFilters = () => {
    platform.haptic.impact('light')
    showFilterModal.value = true
}

// Открывается снаружи (кнопка-фильтр в шапке CatalogView) — сама эта вьюха
// не рисует шапку, шапка общая для вкладок "Рецепты"/"Продукты".
defineExpose({ openFilters })

// Если открытое блюдо удалили (в том числе с другого устройства через
// realtime), закрываем модалку — иначе она останется открытой на
// удалённой записи, и "Сохранить"/"Удалить" будут бить в несуществующий id.
watch(() => dishStore.dishes, (dishes) => {
  const openedId = viewingDish.value?.id
  if (!showDetailModal.value || !openedId) return
  const stillExists = dishes.some((d) => d.id === openedId)
  if (!stillExists) {
    showDetailModal.value = false
    viewingDish.value = null
    uiStore.showToast('Это блюдо было удалено', 'info')
  }
})

onMounted(async () => {
  const promises = []
  if (dishStore.dishes.length === 0) promises.push(dishStore.fetchDishes())
  if (productStore.products.length === 0) promises.push(productStore.fetchProducts())
  promises.push(dictionaries.fetchDictionaries())
  await Promise.all(promises)
})

// --- ЛОГИКА ФИЛЬТРАЦИИ ---
const filteredDishes = computed(() => {
  let result = dishStore.dishes
  
  // 1. Поиск (самый приоритетный)
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase()
    result = result.filter(d => d.name.toLowerCase().includes(q))
  }

  // 2. Вид приёма пищи (Завтрак/Обед...)
  if (uiStore.dishes.activeTag) {
    result = result.filter(d => (d.meal_type || []).includes(uiStore.dishes.activeTag))
  }

  // 3. Вид блюда (Горячее/Салат...)
  if (uiStore.dishes.activeCategory !== 'all') {
    result = result.filter(d => d.dish_type === uiStore.dishes.activeCategory)
  }

  // 4. ТЕГИ (Множественный выбор, логика AND)
  if (uiStore.dishes.filterTags.length > 0) {
      result = result.filter(dish => {
          const dishTagIds = Array.isArray(dish.tags) ? dish.tags : []
          return uiStore.dishes.filterTags.every(tagId => dishTagIds.includes(tagId))
      })
  }
  
  return result
})
</script>

<template>
  <div class="h-full bg-slate-50 flex flex-col relative">

    <div class="flex-1 relative overflow-hidden">
      
      <div v-if="filteredDishes.length === 0" class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div class="empty-state-container">
          <div class="empty-state-icon">
            <span class="material-icons-round" style="font-size: 64px;">search_off</span>
          </div>
          <p class="empty-state-title">Ничего не найдено</p>
          <p v-if="uiStore.dishes.filterTags.length > 0" class="empty-state-desc">Попробуйте сбросить теги</p>
        </div>
      </div>

      <Transition :name="transitionName">
        <div :key="uiStore.dishes.activeTag || 'all'" class="absolute inset-0 w-full h-full overflow-y-auto px-5 pt-4 pb-app-nav scroll-area">
          <div class="space-y-2 relative min-h-full">
            <div 
                v-for="dish in filteredDishes" 
                :key="dish.id" 
                @click="openDish(dish)" 
                class="bg-white px-4 py-3 rounded-2xl shadow-sm flex flex-col gap-1.5 tap-effect border border-slate-100/50 w-full"
            >
                <div class="flex items-start justify-between gap-3">
                    <span class="card-title leading-snug flex items-center gap-1.5 min-w-0">
                        <span v-if="dish.batch_yield > 1" title="Готовится про запас на несколько приёмов пищи" class="material-icons-round text-sm text-indigo-500 shrink-0">kitchen</span>
                        <span class="truncate">{{ dish.name }}</span>
                    </span>
                    <span class="text-sm font-black text-slate-900 shrink-0 leading-snug">{{ dish.kcal || 0 }}<span class="text-[10px] font-bold text-slate-400 ml-0.5">ккал</span></span>
                </div>

                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md shrink-0">
                        {{ dictionaries.getDishTypeById(dish.dish_type)?.name || '...' }}
                    </span>
                    <span class="text-[10px] text-secondary truncate min-w-0">
                        {{ cardMeta(dish) }}
                    </span>
                    <div class="flex gap-1.5 text-[10px] font-normal text-secondary shrink-0 ml-auto leading-tight">
                        <span>Б {{ dish.protein || 0 }}</span>
                        <span>Ж {{ dish.fat || 0 }}</span>
                        <span>У {{ dish.carbs || 0 }}</span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <div class="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px)+16px)] right-5 z-[60]">
      <button 
        @click="openCreateDish" 
        class="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center tap-effect hover:scale-105 transition-transform"
      >
        <span class="material-icons-round text-3xl">add</span>
      </button>
    </div>

    <DishDetailModal 
       :is-open="showDetailModal" 
       :dish="viewingDish"
       @close="showDetailModal = false"
    />

    <DishFilterModal
        :is-open="showFilterModal"
        @close="showFilterModal = false"
    />

  </div>
</template>
