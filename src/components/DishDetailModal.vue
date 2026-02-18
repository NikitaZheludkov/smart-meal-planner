<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan'
import { useTelegramStore } from '../stores/telegram'
import { useUIStore } from '../stores/ui'

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
    // Можно переходить только назад или на следующий (если валидно)
    // Но для простоты разрешим кликать назад
    if (step < currentStep.value) {
        direction.value = 'prev'
        currentStep.value = step
        telegram.haptic.impact('light')
    }
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
    if (formData.value.is_batch === undefined) formData.value.is_batch = false
    formData.value.batch_yield = Number(formData.value.batch_yield) || 1
    
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
    if (newVal && props.dish) {
        initForm(props.dish)
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
  
  isSaving.value = true
  ui.addLog(`Попытка сохранения блюда: ${formData.value.name}`, 'info', formData.value)
  
  try {
    telegram.haptic.notification('success')
    
    if (formData.value.id) {
      await dishStore.updateDish(formData.value.id, formData.value)
      ui.addLog('Блюдо успешно обновлено', 'info')
      await planStore.fetchPlan() 
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
    if (isEditing.value && currentStep.value > 1) {
        prevStep()
        return
    }
    
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
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
      
      <div class="bg-white w-full max-w-sm h-full max-h-[calc(100%-96px)] rounded-t-[32px] sm:rounded-[32px] p-0 shadow-2xl relative z-10 flex flex-col overflow-hidden modal-content">
        
        <div class="px-5 pt-5 pt-tg-overlay pb-3 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white z-20 min-h-[70px]">
        
        <div class="w-20 flex justify-start">
            <button 
                v-if="showTagSelection" 
                @click="closeTagSelector" 
                class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 tap-effect active:scale-95 transition-transform"
            >
                <span class="material-icons-round text-xl">arrow_back</span>
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
            <h3 class="text-lg font-bold text-slate-900 truncate text-center leading-tight">
                {{ showTagSelection ? 'Свойства' : (isEditing ? (formData.id ? 'Редактирование' : 'Новое блюдо') : '') }}
            </h3>
            
            <!-- Индикатор шагов -->
            <div v-if="isEditing && !showTagSelection" class="flex items-center gap-1.5 mt-1">
                <button 
                    v-for="step in totalSteps" 
                    :key="step"
                    @click="goToStep(step)"
                    class="h-1.5 rounded-full transition-all duration-300"
                    :class="step <= currentStep ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-200'"
                    :disabled="step > currentStep"
                ></button>
            </div>
        </div>

        <div class="w-20 flex justify-end items-center gap-2">
            <button v-if="showTagSelection" @click="closeTagSelector" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect">Готово</button>
            
            <template v-else>
                <!-- Кнопка сохранения/далее для редактирования -->
                <button 
                    v-if="isEditing" 
                    @click="currentStep === totalSteps ? handleSave() : nextStep()" 
                    class="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg tap-effect active:scale-95 transition-transform transition-colors flex items-center gap-2"
                    :class="(formData.name && formData.meal_type_ids.length > 0 && !isSaving) ? 'bg-slate-900' : 'bg-slate-300 cursor-not-allowed'"
                    :disabled="(currentStep === 1 && (!formData.name || formData.meal_type_ids.length === 0)) || isSaving"
                >
                    <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                    {{ isSaving ? '...' : (currentStep === totalSteps ? 'Готово' : 'Далее') }}
                </button>
                
                <button 
                    v-if="!isEditing" 
                    @click="isEditing = true; currentStep = 1" 
                    class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center tap-effect hover:bg-indigo-100 active:scale-95 transition-transform"
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
                    <h2 class="text-2xl font-black text-slate-900 leading-tight mb-2">{{ formData.name }}</h2>
                    <div class="flex flex-wrap justify-center gap-1.5">
                        <span class="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                            {{ getMealTypeName }}
                        </span>
                        <span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                            {{ getDishTypeName }}
                        </span>
                        <span v-for="tag in formData.tags" :key="tag.id" class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                             {{ tag.icon }} {{ tag.name }}
                        </span>
                    </div>
                </div>
                
                <div class="grid grid-cols-4 gap-2">
                    <div class="bg-orange-50 p-2 rounded-2xl border border-orange-100 flex flex-col items-center">
                        <span class="text-lg font-black text-orange-500">{{ formData.kcal || 0 }}</span>
                        <span class="text-[9px] font-bold text-orange-300 uppercase">Ккал</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.protein || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase">Белки</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.fat || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase">Жиры</span>
                    </div>
                    <div class="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                        <span class="text-lg font-black text-slate-700">{{ formData.carbs || 0 }}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase">Угле</span>
                    </div>
                </div>

                <div v-if="formData.ingredients?.length" class="w-full">
                    <h4 class="text-xs font-black text-slate-400 mb-3 uppercase tracking-widest ml-1">Состав</h4>
                    <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 text-sm">
                            <span class="font-bold text-slate-700">{{ ing.name }}</span>
                            <span class="font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">{{ ing.amount }} {{ ing.unit }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="formData.description" class="w-full">
                    <h4 class="text-xs font-black text-slate-400 mb-3 uppercase tracking-widest ml-1">Приготовление</h4>
                    <div class="bg-slate-50 p-4 rounded-2xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap border border-slate-100">
                        {{ formData.description }}
                    </div>
                </div>
            </div>

            <div v-else class="space-y-4 pb-20 relative overflow-hidden min-h-[400px]">
                
                <Transition :name="direction === 'next' ? 'slide-left' : 'slide-right'" mode="out-in">
                <!-- STEP 1: Basic Info -->
                <div v-if="currentStep === 1" key="step1" class="space-y-6">
                    <div class="space-y-4">
                        <label class="block text-sm font-black text-slate-700 ml-1">Название блюда</label>
                        <input 
                            v-model="formData.name" 
                            placeholder="Например: Борщ с говядиной" 
                            class="w-full text-xl font-bold text-slate-900 bg-slate-50 rounded-2xl p-4 placeholder:text-slate-300 outline-none border-2 border-transparent focus:border-indigo-100 transition-colors"
                            autofocus
                        >
                    </div>

                    <!-- Категории (Тип и Прием пищи) -->
                    <div class="space-y-4">
                        <div class="space-y-2">
                            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Тип блюда</label>
                            <div class="grid grid-cols-2 gap-2">
                                <button 
                                    v-for="t in dictionaries.dishTypes" 
                                    :key="t.id" 
                                    @click="formData.dish_type_id = t.id"
                                    type="button"
                                    class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all border tap-effect text-center"
                                    :class="formData.dish_type_id === t.id ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
                                >
                                    {{ t.name }}
                                </button>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Прием пищи</label>
                            <div class="grid grid-cols-2 gap-2">
                                <button 
                                    v-for="t in dictionaries.mealTypes" 
                                    :key="t.id" 
                                    @click="toggleMealType(t.id)"
                                    type="button"
                                    class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all border tap-effect text-center"
                                    :class="formData.meal_type_ids.includes(t.id) ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'"
                                >
                                    {{ t.name }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STEP 2: Ingredients & Batch -->
                <div v-else-if="currentStep === 2" key="step2" class="space-y-4">
                    
                    <!-- Batch Switch -->
                    <div class="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-indigo-900">Многопорционное блюдо</span>
                            <span class="text-[10px] font-bold text-indigo-400">Готовка впрок (на несколько раз)</span>
                        </div>
                        <div class="flex items-center bg-white rounded-lg border border-indigo-100 p-0.5 shadow-sm">
                            <button 
                                @click="formData.is_batch = false" 
                                class="px-3 py-1.5 rounded-md text-[10px] font-bold transition-all"
                                :class="!formData.is_batch ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'"
                            >Нет</button>
                            <button 
                                @click="formData.is_batch = true" 
                                class="px-3 py-1.5 rounded-md text-[10px] font-bold transition-all"
                                :class="formData.is_batch ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'"
                            >Да</button>
                        </div>
                    </div>

                    <div v-if="formData.is_batch" class="bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
                        <div class="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-lg">{{ formData.batch_yield }}</div>
                        <div class="flex-1 text-xs font-bold text-slate-600">Количество порций на выходе</div>
                        <div class="flex gap-2">
                            <button @click="formData.batch_yield = Math.max(1, formData.batch_yield - 1)" class="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 tap-effect"><span class="material-icons-round">remove</span></button>
                            <button @click="formData.batch_yield++" class="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 tap-effect"><span class="material-icons-round">add</span></button>
                        </div>
                    </div>

                    <div class="h-px bg-slate-100 w-full my-2"></div>

                    <!-- Ingredients Search & List -->
                    <div class="space-y-3">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Состав блюда</label>
                        
                        <!-- Search -->
                        <div class="relative bg-white rounded-2xl p-1 border-2 border-slate-100 focus-within:border-indigo-300 transition-colors shadow-sm z-30">
                            <div v-if="!selectedProductToAdd" class="flex items-center">
                                <span class="material-icons-round text-slate-400 text-xl ml-3">search</span>
                                <input 
                                    v-model="productSearchQuery" 
                                    @blur="setTimeout(() => showProductDropdown = false, 200)"
                                    placeholder="Найти ингредиент..." 
                                    class="w-full p-3 bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300"
                                >
                            </div>
                            <div v-else class="flex gap-2 items-center px-2 py-1">
                                <div class="flex-1 font-bold text-slate-800 text-sm truncate pl-2">{{ selectedProductToAdd.name }}</div>
                                <input 
                                    ref="quantityInput"
                                    v-model="amountToAdd" 
                                    type="number" 
                                    inputmode="decimal"
                                    :placeholder="selectedProductToAdd.unit" 
                                    class="w-20 p-2 bg-slate-50 rounded-xl font-bold text-center outline-none border border-slate-200 focus:border-indigo-300 text-sm" 
                                    @keydown.enter="addIngredientToForm"
                                >
                                <button @click="addIngredientToForm" class="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-md tap-effect disabled:opacity-50" :disabled="!amountToAdd"><span class="material-icons-round text-sm">check</span></button>
                                <button @click="selectedProductToAdd = null" class="w-9 h-9 text-slate-400 flex items-center justify-center hover:text-slate-600"><span class="material-icons-round text-sm">close</span></button>
                            </div>

                            <!-- Dropdown -->
                            <div v-if="showProductDropdown && filteredProducts.length > 0" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-60">
                                <button 
                                    v-for="prod in filteredProducts" 
                                    :key="prod.id"
                                    @click="selectProductFromSearch(prod)"
                                    class="w-full text-left px-4 py-3 hover:bg-slate-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center group"
                                >
                                    <span class="group-hover:text-indigo-600 transition-colors">{{ prod.name }}</span> 
                                    <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{{ prod.unit }}</span>
                                </button>
                            </div>
                        </div>

                        <!-- List -->
                        <div v-if="formData.ingredients.length > 0" class="bg-slate-50 rounded-2xl p-2 space-y-1 mt-2">
                            <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <div class="w-2 h-2 rounded-full bg-indigo-300"></div>
                                <div class="flex-1 font-bold text-slate-700 text-sm">{{ ing.name }}</div>
                                
                                <div v-if="editingIngredientIndex === idx" class="flex items-center gap-1">
                                    <input 
                                        v-model="tempAmount" 
                                        type="number" 
                                        inputmode="decimal"
                                        class="ing-edit-input w-16 p-1 bg-slate-50 rounded-lg font-bold text-center outline-none border border-indigo-200 focus:border-indigo-400 text-xs"
                                        @keydown.enter="saveIngredientAmount(idx)"
                                        @blur="saveIngredientAmount(idx)"
                                    >
                                    <span class="text-xs font-bold text-slate-400">{{ ing.unit }}</span>
                                </div>
                                <button 
                                    v-else
                                    @click="startEditingIngredient(idx, ing.amount)"
                                    class="font-bold text-slate-500 text-xs bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
                                >
                                    {{ ing.amount }} {{ ing.unit }}
                                </button>

                                <button @click="removeIngredient(idx)" class="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-lg hover:bg-red-50">
                                    <span class="material-icons-round text-base">close</span>
                                </button>
                            </div>
                        </div>
                        <div v-else class="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            Список ингредиентов пуст
                        </div>
                    </div>
                </div>

                <!-- STEP 3: Details -->
                <div v-else-if="currentStep === 3" key="step3" class="space-y-6">
                    
                    <!-- КБЖУ -->
                    <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">КБЖУ (на порцию)</label>
                        <div class="flex gap-2">
                            <div class="flex-1 relative">
                                <input v-model.number="formData.kcal" type="number" placeholder="0" class="w-full py-2.5 px-1 bg-orange-50 text-orange-600 font-black rounded-xl text-center outline-none border border-orange-100 text-base focus:border-orange-300">
                                <span class="text-[9px] text-slate-400 absolute -bottom-4 left-0 right-0 text-center">Ккал</span>
                            </div>
                            <div class="flex-1 relative">
                                <input v-model.number="formData.protein" type="number" placeholder="0" class="w-full py-2.5 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-sm focus:border-indigo-300">
                                <span class="text-[9px] text-slate-400 absolute -bottom-4 left-0 right-0 text-center">Белки</span>
                            </div>
                            <div class="flex-1 relative">
                                <input v-model.number="formData.fat" type="number" placeholder="0" class="w-full py-2.5 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-sm focus:border-indigo-300">
                                <span class="text-[9px] text-slate-400 absolute -bottom-4 left-0 right-0 text-center">Жиры</span>
                            </div>
                            <div class="flex-1 relative">
                                <input v-model.number="formData.carbs" type="number" placeholder="0" class="w-full py-2.5 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-sm focus:border-indigo-300">
                                <span class="text-[9px] text-slate-400 absolute -bottom-4 left-0 right-0 text-center">Угл</span>
                            </div>
                        </div>
                        <div class="h-2"></div>
                    </div>

                    <!-- Теги -->
                    <div class="space-y-2">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Теги и свойства</label>
                        <div class="flex flex-wrap gap-2 min-h-[40px]">
                            <button 
                                @click="openTagSelector"
                                class="h-9 px-4 rounded-xl bg-slate-900 text-white shadow-md flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-800 transition-colors tap-effect"
                            >
                                <span class="material-icons-round text-sm">add</span> Добавить
                            </button>
                            <span v-for="tag in formData.tags" :key="tag.id" class="h-9 px-3 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-600 shadow-sm">
                                <span>{{ tag.icon }}</span>
                                <span>{{ tag.name }}</span>
                                <button @click="toggleTag(tag)" class="ml-1 text-slate-300 hover:text-red-500"><span class="material-icons-round text-sm">close</span></button>
                            </span>
                        </div>
                    </div>

                    <!-- Описание -->
                    <div class="space-y-2">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Заметки / Рецепт</label>
                        <textarea v-model="formData.description" placeholder="Опишите процесс приготовления..." class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-2 ring-indigo-500/10 border border-slate-100 min-h-[150px] text-sm leading-relaxed"></textarea>
                    </div>

                    <div v-if="formData.id" class="pt-4 flex justify-center">
                        <button @click="handleDelete" class="text-red-400 hover:text-red-500 text-xs font-bold flex items-center gap-1 py-2 px-4 rounded-lg hover:bg-red-50 transition-colors">
                            <span class="material-icons-round text-sm">delete_outline</span> Удалить блюдо
                        </button>
                    </div>
                </div>
                </Transition>

            </div>
        </div>

        <div v-else class="absolute inset-0 bg-slate-50 overflow-y-auto pb-20 pt-4 px-4 no-scrollbar">
            <div class="space-y-6">
                 <div v-for="group in groupedTags" :key="group.code" class="space-y-3">
                    <div class="flex items-center gap-2 px-1">
                        <div class="text-xs font-black text-slate-400 uppercase tracking-widest">{{ group.label }}</div>
                        <div class="h-[1px] bg-slate-200 flex-1"></div>
                    </div>
                    
                    <div class="flex flex-wrap gap-2">
                         <button 
                            v-for="tag in group.tags" 
                            :key="tag.id" 
                            @click="toggleTag(tag)"
                            class="px-4 py-3 rounded-2xl text-sm font-bold transition-all border tap-effect flex items-center gap-2"
                            :class="isTagSelected(tag) ? 'bg-indigo-500 text-white border-indigo-500 shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border-slate-200'"
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
    </div>
    </div>
  </Transition>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease-out;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.25s ease-out;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>
