<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan'
import { useTelegramStore } from '../stores/telegram'
import { useUIStore } from '../stores/ui'
import ProductDetailModal from './ProductDetailModal.vue'

const props = defineProps({
  isOpen: Boolean,
  dish: Object 
})

const emit = defineEmits(['close'])
const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const planStore = usePlanStore()
const telegram = useTelegramStore()
const ui = useUIStore()

// Состояние интерфейса
const isEditing = ref(false)
const isSaving = ref(false)
const showTagSelection = ref(false) // Переключатель экранов
const currentStep = ref(1)
const totalSteps = 3
const editingIngredientIndex = ref(null)
const tempAmount = ref('')
const showCreateProductModal = ref(false)
const newProductTarget = ref(null)

const formData = ref({
    id: null,
    name: '',
    dish_type_id: '',
    meal_type_ids: [],
    description: '',
    kcal: null, protein: null, fat: null, carbs: null,
    is_batch: false,
    batch_yield: 1,
    tags: [],
    ingredients: []
})

// --- ЛОГИКА ТЕГОВ ---

const categoryLabels = {
    'time': 'Время приготовления',
    'context': 'Сценарий и Метод',
    'diet': 'Тип питания и Здоровье',
    'other': 'Прочее'
}

const groupedTags = computed(() => {
    const groups = {}
    dictionaries.availableTags.forEach(tag => {
        const cat = tag.category || 'other'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(tag)
    })
    
    const order = ['time', 'context', 'diet']
    
    return order.map(code => ({
        code,
        label: categoryLabels[code] || code,
        tags: groups[code] || []
    })).filter(g => g.tags.length > 0)
})

const isTagSelected = (tag) => {
    return formData.value.tags.some(t => t.id === tag.id)
}

const toggleTag = (tag) => {
    telegram.haptic.selection()
    if (isTagSelected(tag)) {
        formData.value.tags = formData.value.tags.filter(t => t.id !== tag.id)
    } else {
        formData.value.tags.push(tag)
    }
}

// Управление экранами
const openTagSelector = () => {
    telegram.haptic.impact('light')
    showTagSelection.value = true
}

const closeTagSelector = () => {
    telegram.haptic.impact('light')
    showTagSelection.value = false
}

const direction = ref('next')

// --- ЛОГИКА ШАГОВ ---
const nextStep = () => {
    if (currentStep.value < totalSteps) {
        // Валидация для 1 шага
        if (currentStep.value === 1) {
            if (!formData.value.name) {
                ui.showToast('Введите название блюда', 'error')
                telegram.haptic.notification('error')
                return
            }
             if (!formData.value.meal_type_ids || formData.value.meal_type_ids.length === 0) {
                ui.showToast('Выберите прием пищи', 'error')
                telegram.haptic.notification('error')
                return
            }
        }
        direction.value = 'next'
        currentStep.value++
        telegram.haptic.impact('light')
    } else if (currentStep.value === totalSteps) {
        // На последнем шаге - сохраняем
        handleSave()
    }
}

const prevStep = () => {
    if (currentStep.value > 1) {
        direction.value = 'prev'
        currentStep.value--
        telegram.haptic.impact('light')
    }
}

const goToStep = (step) => {
    // Валидация для 1 шага если мы пытаемся уйти с него или перепрыгнуть через него (хотя тут перепрыгнуть нельзя, всегда с 1 начинаем)
    if (step > 1) {
         if (!formData.value.name) {
            ui.showToast('Введите название блюда', 'error')
            telegram.haptic.notification('error')
            return
        }
         if (!formData.value.meal_type_ids || formData.value.meal_type_ids.length === 0) {
            ui.showToast('Выберите прием пищи', 'error')
            telegram.haptic.notification('error')
            return
        }
    }

    direction.value = step > currentStep.value ? 'next' : 'prev'
    currentStep.value = step
    telegram.haptic.impact('light')
}


// --- ЛОГИКА ИНГРЕДИЕНТОВ ---
const productSearchQuery = ref('')
const showProductDropdown = ref(false)
const selectedProductToAdd = ref(null)
const amountToAdd = ref('')
const quantityInput = ref(null)

const filteredProducts = computed(() => {
    const q = productSearchQuery.value.toLowerCase().trim()
    if (!q) return []
    
    return productStore.products
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 50)
})

watch(productSearchQuery, (newValue) => {
  if (newValue.length > 0) {
    showProductDropdown.value = true
  } else {
    showProductDropdown.value = false
  }
})

const selectProductFromSearch = (prod) => {
    selectedProductToAdd.value = prod
    productSearchQuery.value = ''
    showProductDropdown.value = false
    amountToAdd.value = ''
    
    // Авто-фокус на поле ввода количества
    nextTick(() => {
        quantityInput.value?.focus()
    })
}

const addIngredientToForm = () => {
    if (!selectedProductToAdd.value || !amountToAdd.value) return
    formData.value.ingredients.push({
        product_id: selectedProductToAdd.value.id,
        name: selectedProductToAdd.value.name,
        unit: selectedProductToAdd.value.unit,
        amount: parseFloat(amountToAdd.value)
    })
    selectedProductToAdd.value = null
    amountToAdd.value = ''
    telegram.haptic.notification('success')
}

const removeIngredient = (index) => {
    formData.value.ingredients.splice(index, 1)
    telegram.haptic.impact('light')
}

const startEditingIngredient = (index, amount) => {
    editingIngredientIndex.value = index
    tempAmount.value = amount
    telegram.haptic.selection()
    
    nextTick(() => {
        // Фокус на инпут (он будет единственным с классом ing-edit-input)
        const input = document.querySelector('.ing-edit-input')
        if (input) input.focus()
    })
}

const saveIngredientAmount = (index) => {
    if (tempAmount.value) {
        formData.value.ingredients[index].amount = parseFloat(tempAmount.value)
    }
    editingIngredientIndex.value = null
    tempAmount.value = ''
    telegram.haptic.notification('success')
}



// --- ИНИЦИАЛИЗАЦИЯ ---
const initForm = (dishData) => {
    formData.value = JSON.parse(JSON.stringify(dishData))
    
    // Transform flat meal_types array of objects to array of IDs for the form
    if (dishData.meal_types && Array.isArray(dishData.meal_types)) {
        formData.value.meal_type_ids = dishData.meal_types.map(m => m.id)
    } else if (dishData.meal_type_id) {
         // Fallback for old data or if not yet populated
        formData.value.meal_type_ids = [dishData.meal_type_id]
    } else {
        formData.value.meal_type_ids = []
    }

    if (!formData.value.ingredients) formData.value.ingredients = []
    
    // Fix for nested ingredients from planStore
    formData.value.ingredients = formData.value.ingredients.map(ing => {
        if (ing.products && !ing.name) {
            return {
                product_id: ing.product_id,
                name: ing.products.name || 'Неизвестно',
                unit: ing.products.unit || '',
                amount: ing.amount
            }
        }
        return ing
    })

    if (!formData.value.tags) formData.value.tags = []
    
    // Fix for batch fields defaults
    formData.value.batch_yield = Number(formData.value.batch_yield) || 1
    formData.value.is_batch = formData.value.batch_yield > 1
    
    if (!formData.value.id) {
        if (!formData.value.dish_type_id && dictionaries.dishTypes.length) {
            formData.value.dish_type_id = dictionaries.dishTypes[0].id
        }
        if ((!formData.value.meal_type_ids || formData.value.meal_type_ids.length === 0) && dictionaries.mealTypes.length) {
             // Default to "Lunch" or the second option if available, otherwise the first
            formData.value.meal_type_ids = [dictionaries.mealTypes[1]?.id || dictionaries.mealTypes[0]?.id]
        }
        isEditing.value = true
    } else {
        isEditing.value = false
    }
    
    productSearchQuery.value = ''
    selectedProductToAdd.value = null
    showTagSelection.value = false 
    
    // Подгружаем продукты, если их нет
    if (productStore.products.length === 0) {
        productStore.fetchProducts()
    }
    
    currentStep.value = 1
    editingIngredientIndex.value = null
    tempAmount.value = ''
}

watch(() => props.isOpen, (newVal) => {
    if (newVal) {
        isSaving.value = false // Reset loading state
        if (props.dish) {
            initForm(props.dish)
        }
    }
})

watch(() => props.dish, (newVal) => {
  if (newVal && props.isOpen) {
    initForm(newVal)
  }
})

const handleSave = async () => {
  if (!formData.value.name || isSaving.value) return
  
  if (!formData.value.meal_type_ids || formData.value.meal_type_ids.length === 0) {
      ui.showToast('Выберите хотя бы один прием пищи', 'error')
      telegram.haptic.notification('error')
      return
  }
  
  // Ensure is_batch is synced with yield
  formData.value.is_batch = (formData.value.batch_yield || 1) > 1

  isSaving.value = true
  ui.addLog(`Попытка сохранения блюда: ${formData.value.name}`, 'info', formData.value)
  
  try {
    telegram.haptic.notification('success')
    
    if (formData.value.id) {
      await dishStore.updateDish(formData.value.id, formData.value)
      ui.addLog('Блюдо успешно обновлено', 'info')
      // ОПТИМИЗАЦИЯ: Не обновляем весь план при каждом чихе, это дорого.
      // План обновится сам через Realtime, если нужно, или при следующем заходе.
      // Если критично - лучше обновлять локально в сторе.
      // await planStore.fetchPlan() 
    } else {
      await dishStore.addDish(formData.value)
      ui.addLog('Блюдо успешно добавлено', 'info')
    }
    isEditing.value = false
    emit('close')
  } catch (e) {
    ui.addLog('Ошибка при сохранении блюда', 'error', {
      error: e.message,
      stack: e.stack,
      code: e.code
    })
    console.error('Save error:', e)
    telegram.haptic.notification('error')
    alert(e.message || 'Не удалось сохранить блюдо. Проверьте соединение.')
  } finally {
    isSaving.value = false
  }
}

const handleDelete = async () => {
    telegram.haptic.notification('warning')
    if(confirm('Удалить блюдо?')) {
        await dishStore.deleteDish(formData.value.id)
        await planStore.fetchPlan()
        emit('close')
    }
}

// Универсальная функция "Отмены / Закрытия"
const handleCancel = () => {
    telegram.haptic.impact('light')
    
    // 0. Если есть шаги и мы не на первом, возвращаемся назад
    // if (isEditing.value && currentStep.value > 1) {
    //     prevStep()
    //     return
    // }
    
    // 1. Если это новое блюдо - просто закрываем модалку
    if (!formData.value.id) {
        emit('close')
        return
    }

    // 2. Если редактируем существующее - сбрасываем и выходим из режима правки
    if (isEditing.value) {
        isEditing.value = false
        formData.value = JSON.parse(JSON.stringify(props.dish))
        return
    }

    // 3. Если просто смотрим - закрываем модалку
    emit('close')
}

const getDishTypeName = computed(() => {
    return dictionaries.getDishTypeById(formData.value.dish_type_id)?.name || '...'
})
const getMealTypeName = computed(() => {
    if (!formData.value.meal_type_ids || formData.value.meal_type_ids.length === 0) return '...'
    
    // Sort selected IDs based on the order in dictionaries.mealTypes
    const sortedIds = [...formData.value.meal_type_ids].sort((a, b) => {
        const indexA = dictionaries.mealTypes.findIndex(m => m.id === a)
        const indexB = dictionaries.mealTypes.findIndex(m => m.id === b)
        return indexA - indexB
    })

    return sortedIds
        .map(id => dictionaries.getMealTypeById(id)?.name)
        .filter(n => n)
        .join(', ')
})

const toggleMealType = (id) => {
    telegram.haptic.selection()
    if (formData.value.meal_type_ids.includes(id)) {
        formData.value.meal_type_ids = formData.value.meal_type_ids.filter(tid => tid !== id)
    } else {
        formData.value.meal_type_ids.push(id)
    }
}

const openCreateProduct = () => {
    newProductTarget.value = {}
    showCreateProductModal.value = true
}

const onProductCreated = (product) => {
    showCreateProductModal.value = false
    selectedProductToAdd.value = product
    productSearchQuery.value = ''
    amountToAdd.value = ''
    
    // Focus on amount input
    nextTick(() => {
        quantityInput.value?.focus()
    })
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
      
      <div class="bg-white w-full max-w-sm h-[calc(100%-48px)] rounded-t-[40px] sm:rounded-[40px] p-0 shadow-2xl relative z-10 flex flex-col overflow-hidden modal-content">
        
        <!-- Handle -->
        <div class="w-full bg-white pt-2 pb-1 shrink-0 z-20 rounded-t-[40px]">
            <div class="modal-handle"></div>
        </div>

        <div class="px-5 pb-3 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white z-20 min-h-[50px]">
        
        <div class="w-20 flex justify-start">
            <button 
                v-if="showTagSelection" 
                @click="closeTagSelector" 
                class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 tap-effect active:scale-95 transition-transform"
            >
                <span class="material-icons-outlined text-xl">arrow_back</span>
            </button>

            <button 
                v-else 
                @click="handleCancel" 
                class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
            >
                <span class="material-icons-round text-xl">{{ (isEditing && currentStep > 1) ? 'arrow_back' : 'close' }}</span>
            </button>
        </div>
        
        <div class="flex-1 flex flex-col items-center justify-center px-2">
            <h3 v-if="!isEditing || showTagSelection" class="text-lg font-bold text-slate-900 truncate text-center leading-tight">
                {{ showTagSelection ? 'Свойства' : (formData.id ? 'Просмотр' : 'Новое блюдо') }}
            </h3>
            
             <!-- HEADER TABS (Visible only in Edit Mode) -->
            <div v-else class="flex bg-slate-100 p-1 rounded-2xl w-full max-w-[200px]">
                <button 
                    v-for="(label, idx) in ['Инфо', 'Состав', 'Детали']" 
                    :key="idx"
                    @click="goToStep(idx + 1)"
                    class="flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300 tap-effect"
                    :class="currentStep === (idx + 1) ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
                >
                    {{ label }}
                </button>
            </div>
        </div>

        <div class="w-20 flex justify-end items-center gap-2">
            <button v-if="showTagSelection" @click="closeTagSelector" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect">Готово</button>
            
            <template v-else>
                <!-- Кнопка сохранения/далее для редактирования -->
                <button 
                    v-if="isEditing" 
                    @click="handleSave" 
                    class="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg tap-effect active:scale-95 transition-transform transition-colors flex items-center gap-2"
                    :class="(formData.name && formData.meal_type_ids.length > 0 && !isSaving) ? 'bg-slate-900' : 'bg-slate-300 cursor-not-allowed'"
                    :disabled="(!formData.name || formData.meal_type_ids.length === 0) || isSaving"
                >
                    <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                    {{ isSaving ? 'Сохранение' : 'Готово' }}
                </button>
                
                <button 
                    v-if="!isEditing" 
                    @click="isEditing = true; currentStep = 1" 
                    class="w-10 h-10 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
                >
                    <span class="material-icons-round text-xl">edit</span>
                </button>
            </template>
        </div>
      </div>

      <div class="flex-1 overflow-hidden relative bg-white">
        
        <transition name="slide-fade">
        
        <div v-if="!showTagSelection" class="absolute inset-0 overflow-y-auto px-6 pb-[76px] pt-4 no-scrollbar">
            
            <div v-if="!isEditing" class="flex flex-col space-y-6">
                <div class="text-center">
                    <h2 class="text-2xl card-title leading-tight mb-2">{{ formData.name }}</h2>
                    <div class="flex flex-wrap justify-center gap-1.5">
                        <span class="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold">
                            {{ getMealTypeName }}
                        </span>
                        <span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200">
                            {{ getDishTypeName }}
                        </span>
                        <span v-for="tag in formData.tags" :key="tag.id" class="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold flex items-center gap-1">
                             {{ tag.icon }} {{ tag.name }}
                        </span>
                    </div>
                </div>
                
                <div class="grid grid-cols-4 gap-2">
                    <div class="bg-slate-100 p-2 rounded-2xl border border-slate-200 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-900">{{ formData.kcal || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase uppercase uppercase">Ккал</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.protein || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase uppercase uppercase">Белки</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.fat || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase uppercase uppercase">Жиры</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.carbs || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase uppercase uppercase">Угле</span>
                    </div>
                </div>

                <div v-if="formData.ingredients?.length" class="w-full">
                    <h4 class="card-title text-sm mb-3 ml-1">
                        Состав <span v-if="(formData.batch_yield || 1) > 1" class="text-[9px] font-normal text-secondary opacity-70">(На {{ formData.batch_yield }} порц.)</span>
                    </h4>
                    <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 text-sm">
                            <span class="card-title text-sm">{{ ing.name }}</span>
                            <span class="font-normal text-secondary bg-slate-50 px-2 py-0.5 rounded-md">{{ ing.amount }} {{ ing.unit }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="formData.description" class="w-full">
                    <h4 class="card-title text-sm mb-3 ml-1">Приготовление</h4>
                    <div class="bg-slate-50 p-4 rounded-2xl text-black text-sm leading-relaxed whitespace-pre-wrap border border-slate-100">
                        {{ formData.description }}
                    </div>
                </div>

                <div class="pt-2">
                    <button 
                        v-if="!isEditing"
                        @click="isEditing = true; currentStep = 1" 
                        class="btn-primary w-full shadow-lg text-sm flex items-center justify-center gap-2 mb-3"
                    >
                        <span class="material-icons-round text-lg">edit</span>
                        Редактировать
                    </button>
                    
                    <button 
                        v-if="!isEditing"
                        @click="$emit('close')" 
                        class="btn-secondary w-full text-sm font-bold"
                    >
                        Закрыть
                    </button>
                </div>
            </div>

            <div v-else class="space-y-4 pb-20 relative overflow-hidden min-h-[400px]">
                
                <Transition :name="direction === 'next' ? 'step-next' : 'step-prev'" mode="out-in">
                <!-- STEP 1: Basic Info -->
                <div v-if="currentStep === 1" key="step1" class="space-y-4">
                    <div class="space-y-2">
                        <input 
                            v-model="formData.name" 
                            placeholder="Название блюда"
                            class="text-center text-xl font-bold bg-slate-50 border-none rounded-2xl px-4 py-3 w-full focus:ring-0 placeholder:text-slate-300"
                            autofocus
                        >
                    </div>

                    <!-- Compact Dish Type & Meal Type -->
                    <div class="space-y-3">
                        <!-- Dish Types Horizontal Scroll -->
                        <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button 
                                v-for="t in dictionaries.dishTypes" 
                                :key="t.id" 
                                @click="formData.dish_type_id = t.id"
                                type="button"
                                class="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border tap-effect flex items-center gap-1.5"
                                :class="formData.dish_type_id === t.id ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
                            >
                                {{ t.name }}
                                <div v-if="formData.dish_type_id === t.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                            </button>
                        </div>

                        <!-- Meal Types Horizontal Scroll -->
                        <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                             <button 
                                v-for="t in dictionaries.mealTypes" 
                                :key="t.id" 
                                @click="toggleMealType(t.id)"
                                type="button"
                                class="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border tap-effect flex items-center gap-1.5"
                                :class="formData.meal_type_ids.includes(t.id) ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
                            >
                                {{ t.name }}
                                <span v-if="formData.meal_type_ids.includes(t.id)" class="material-icons-round text-[10px]">check</span>
                            </button>
                        </div>
                    </div>
                    
                    <div v-if="formData.id" class="pt-4">
                        <button @click="handleDelete" class="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 tap-effect active:bg-slate-200 transition-colors">
                            <span class="material-icons-round text-sm">delete_outline</span>
                            Удалить блюдо
                        </button>
                    </div>
                </div>

                <!-- STEP 2: Ingredients & Batch -->
                <div v-else-if="currentStep === 2" key="step2" class="space-y-4">
                    
                    <!-- Yield / Portions Input -->
                     <div class="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900">
                                <span class="material-icons-round text-xl">restaurant_menu</span>
                            </div>
                            <div>
                                <div class="text-sm font-black text-slate-900">Выход рецепта</div>
                                <div class="text-[10px] font-bold text-slate-400">На сколько порций этот состав?</div>
                            </div>
                        </div>
                         
                        <div class="flex items-center gap-2">
                            <button 
                                @click="formData.batch_yield = Math.max(1, (formData.batch_yield || 1) - 1); telegram.haptic.selection()"
                                class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-all"
                            >
                                <span class="material-icons-round text-base">remove</span>
                            </button>
                            <input
                                v-model.number="formData.batch_yield" 
                                type="number" 
                                inputmode="numeric"
                                placeholder="1"
                                class="w-10 h-8 bg-transparent text-slate-900 font-black text-center outline-none border-none text-lg"
                                @focus="$event.target.select()"
                            >
                            <button 
                                @click="formData.batch_yield = (formData.batch_yield || 1) + 1; telegram.haptic.selection()"
                                class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-all"
                            >
                                <span class="material-icons-round text-base">add</span>
                            </button>
                        </div>
                    </div>

                    <!-- Compact Search -->
                    <div class="relative bg-white rounded-2xl border border-slate-200 focus-within:border-slate-400 transition-colors shadow-sm z-30 flex items-center pl-3">
                             <span class="material-icons-round text-slate-300 text-xl">search</span>
                             <div v-if="!selectedProductToAdd" class="flex-1">
                                <input 
                                    v-model="productSearchQuery" 
                                    @blur="setTimeout(() => showProductDropdown = false, 200)"
                                    placeholder="Найти и добавить ингредиент..." 
                                    class="w-full p-3.5 bg-transparent font-bold text-slate-700 outline-none border-none text-base placeholder:text-slate-300"
                                >
                             </div>
                             <div v-else class="flex gap-2 items-center flex-1 px-1 py-1">
                                <div class="flex-1 font-bold text-slate-800 text-sm truncate pl-2">{{ selectedProductToAdd.name }}</div>
                                <input 
                                    ref="quantityInput"
                                    v-model="amountToAdd" 
                                    type="number" 
                                    inputmode="decimal"
                                    :placeholder="selectedProductToAdd.unit" 
                                    class="w-16 p-2 bg-slate-50 rounded-xl font-bold text-center outline-none border-none focus:ring-0 text-base" 
                                    @keydown.enter="addIngredientToForm"
                                >
                                <button @click="addIngredientToForm" class="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-md tap-effect disabled:opacity-50" :disabled="!amountToAdd"><span class="material-icons-round text-sm">check</span></button>
                                <button @click="selectedProductToAdd = null" class="w-9 h-9 text-slate-400 flex items-center justify-center hover:text-slate-600"><span class="material-icons-round text-sm">close</span></button>
                            </div>

                             <!-- Dropdown -->
                            <div v-if="showProductDropdown && filteredProducts.length > 0" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-48 z-40">
                                <button 
                                    v-for="prod in filteredProducts" 
                                    :key="prod.id"
                                    @click="selectProductFromSearch(prod)"
                                    class="w-full text-left px-4 py-3 hover:bg-slate-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center group"
                                >
                                    <span class="group-hover:text-slate-900 transition-colors">{{ prod.name }}</span> 
                                    <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{{ prod.unit }}</span>
                                </button>
                            </div>
                         </div>

                        <button 
                            @click="openCreateProduct"
                            class="w-full py-3 rounded-2xl bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 tap-effect active:bg-slate-200 transition-colors mt-2 mb-4"
                        >
                            <span class="material-icons-round text-sm">add_circle_outline</span>
                            Добавить новый продукт
                        </button>
                         

                    <!-- Compact Ingredients List -->
                    <div v-if="formData.ingredients.length > 0" class="space-y-2">
                        <div class="text-[10px] font-bold text-slate-400 pl-2">Состав на {{ formData.batch_yield || 1 }} порц.</div>
                        <div class="bg-slate-50 rounded-2xl p-2 space-y-1">
                        <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div class="w-1.5 h-1.5 rounded-full bg-slate-900 ml-1"></div>
                            <div class="flex-1 font-bold text-slate-700 text-sm truncate">{{ ing.name }}</div>
                            
                            <div v-if="editingIngredientIndex === idx" class="flex items-center gap-1">
                                <input 
                                    v-model="tempAmount" 
                                    type="number" 
                                    inputmode="decimal"
                                    class="ing-edit-input w-16 p-1 bg-slate-50 rounded-lg font-bold text-center outline-none border border-slate-200 focus:border-slate-400 text-base"
                                    @keydown.enter="saveIngredientAmount(idx)"
                                    @blur="saveIngredientAmount(idx)"
                                >
                                <span class="text-[10px] font-bold text-slate-400">{{ ing.unit }}</span>
                            </div>
                            <button 
                                v-else
                                @click="startEditingIngredient(idx, ing.amount)"
                                class="font-bold text-slate-500 text-xs bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
                            >
                                {{ ing.amount }} {{ ing.unit }}
                            </button>

                            <button @click="removeIngredient(idx)" class="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-lg hover:bg-red-50">
                                <span class="material-icons-round text-sm">close</span>
                            </button>
                        </div>
                    </div>
                    </div>
                    <div v-else class="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        Ингредиентов нет
                    </div>
                </div>

                <!-- STEP 3: Details -->
                <div v-else-if="currentStep === 3" key="step3" class="space-y-4">
                    
                    <!-- Compact Macros -->
                    <div class="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
                        <div class="flex gap-2">
                            <div class="flex-1">
                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Ккал</div>
                                <input v-model.number="formData.kcal" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-900 font-black rounded-xl text-center outline-none border border-slate-100 text-base focus:border-slate-300">
                            </div>
                            <div class="flex-1">
                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Белки</div>
                                <input v-model.number="formData.protein" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                            </div>
                            <div class="flex-1">
                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Жиры</div>
                                <input v-model.number="formData.fat" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                            </div>
                            <div class="flex-1">
                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Угл</div>
                                <input v-model.number="formData.carbs" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                            </div>
                        </div>
                    </div>

                    <!-- Compact Tags -->
                    <div class="space-y-1">
                         <div class="flex flex-wrap gap-2 min-h-[36px]">
                            <button 
                                @click="openTagSelector"
                                class="h-9 px-3 rounded-xl bg-slate-900 text-white shadow-md flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-slate-800 transition-colors tap-effect"
                            >
                                <span class="material-icons-round text-sm">add</span> Тег
                            </button>
                            <span v-for="tag in formData.tags" :key="tag.id" class="h-9 px-3 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-600 shadow-sm">
                                <span>{{ tag.icon }}</span>
                                <span>{{ tag.name }}</span>
                                <button @click="toggleTag(tag)" class="ml-1 text-slate-300 hover:text-slate-900"><span class="material-icons-round text-sm">close</span></button>
                            </span>
                        </div>
                    </div>

                    <!-- Compact Description -->
                    <textarea 
                        v-model="formData.description" 
                        placeholder="Заметки / Рецепт" 
                        class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-0 border-none min-h-[120px] text-base leading-relaxed"
                    ></textarea>

                </div>
                </Transition>

            </div>

        </div>

        <div v-else class="absolute inset-0 bg-slate-50 overflow-y-auto pb-20 pt-4 px-4 no-scrollbar">
            <div class="space-y-6">
                 <div v-for="group in groupedTags" :key="group.code" class="space-y-3">
                    <div class="flex items-center gap-2 px-1">
                        <div class="text-xs font-black text-slate-400">{{ group.label }}</div>
                        <div class="h-[1px] bg-slate-200 flex-1"></div>
                    </div>
                    
                    <div class="flex flex-wrap gap-2">
                         <button 
                            v-for="tag in group.tags" 
                            :key="tag.id" 
                            @click="toggleTag(tag)"
                            class="px-4 py-3 rounded-2xl text-sm font-bold transition-all border tap-effect flex items-center gap-2"
                            :class="isTagSelected(tag) ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border-slate-200'"
                         >
                            <span>{{ tag.icon }}</span>
                            <span>{{ tag.name }}</span>
                            <span v-if="isTagSelected(tag)" class="material-icons-round text-sm ml-1">check</span>
                         </button>
                    </div>
                 </div>
            </div>
            <div class="h-10"></div>
        </div>
        
        </transition>

      </div>
      
       <!-- Floating Action Button (Always Visible) -->
      <div v-if="isEditing && !showTagSelection" class="fixed bottom-24 right-5 z-[70]">
        <button 
            @click="nextStep"
            class="w-14 h-14 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center tap-effect hover:scale-105 active:scale-95 transition-all outline-none"
            :disabled="currentStep === 1 && (!formData.name || formData.meal_type_ids.length === 0)"
            :class="(currentStep === 1 && (!formData.name || formData.meal_type_ids.length === 0)) ? 'opacity-50 cursor-not-allowed' : ''"
        >
            <span class="material-icons-round text-3xl">{{ currentStep === totalSteps ? 'check' : 'arrow_forward' }}</span>
        </button>
      </div>

    </div>
    </div>
  </Transition>
    <ProductDetailModal 
        :is-open="showCreateProductModal"
        :product="newProductTarget"
        @saved="onProductCreated"
        @close="showCreateProductModal = false"
    />
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>