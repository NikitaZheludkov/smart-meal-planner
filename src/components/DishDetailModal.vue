<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan'
import { useTelegramStore } from '../stores/telegram'

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

// Состояние интерфейса
const isEditing = ref(false)
const showTagSelection = ref(false) // Переключатель экранов

const formData = ref({
    id: null,
    name: '',
    dish_type_id: '',
    meal_type_id: '',
    description: '',
    kcal: null, protein: null, fat: null, carbs: null,
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

// --- ЛОГИКА ИНГРЕДИЕНТОВ ---
const productSearchQuery = ref('')
const showProductDropdown = ref(false)
const selectedProductToAdd = ref(null)
const amountToAdd = ref('')
const quantityInput = ref(null)

const filteredProducts = computed(() => {
    const q = productSearchQuery.value.toLowerCase().trim()
    // Если запрос пустой, показываем первые 50 продуктов (они уже отсортированы в сторе)
    if (!q) return productStore.products.slice(0, 50)
    
    return productStore.products
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 50)
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

// --- ИНИЦИАЛИЗАЦИЯ ---
watch(() => props.dish, (newVal) => {
  if (newVal) {
    formData.value = JSON.parse(JSON.stringify(newVal))
    if (!formData.value.ingredients) formData.value.ingredients = []
    if (!formData.value.tags) formData.value.tags = []
    
    if (!formData.value.id) {
        if (!formData.value.dish_type_id && dictionaries.dishTypes.length) {
            formData.value.dish_type_id = dictionaries.dishTypes[0].id
        }
        if (!formData.value.meal_type_id && dictionaries.mealTypes.length) {
            formData.value.meal_type_id = dictionaries.mealTypes[1]?.id
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
  }
}, { immediate: true })

const handleSave = async () => {
  if (!formData.value.name) return
  telegram.haptic.notification('success')
  
  if (formData.value.id) {
    await dishStore.updateDish(formData.value.id, formData.value)
    await planStore.fetchPlan() 
  } else {
    await dishStore.addDish(formData.value)
  }
  isEditing.value = false
  emit('close')
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
    return dictionaries.getMealTypeById(formData.value.meal_type_id)?.name || '...'
})

</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
    
    <div class="bg-white w-full max-w-sm h-[90vh] sm:h-[85vh] rounded-t-[32px] sm:rounded-[32px] p-0 shadow-2xl relative z-10 flex flex-col overflow-hidden animate-slide-up">
      
      <div class="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white z-20 min-h-[70px]">
        
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
                <span class="material-icons-round text-xl">close</span>
            </button>
        </div>
        
        <h3 class="text-lg font-bold text-slate-900 truncate px-2 text-center flex-1">
            {{ showTagSelection ? 'Свойства' : (isEditing ? (formData.id ? 'Редактирование' : 'Новое блюдо') : '') }}
        </h3>

        <div class="w-20 flex justify-end items-center gap-2">
            <button v-if="showTagSelection" @click="closeTagSelector" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect">Готово</button>
            
            <template v-else>
                <button 
                    v-if="isEditing" 
                    @click="handleSave" 
                    class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect active:scale-95 transition-transform"
                >
                    Готово
                </button>
                
                <button 
                    v-if="!isEditing" 
                    @click="isEditing = true" 
                    class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center tap-effect hover:bg-indigo-100 active:scale-95 transition-transform"
                >
                    <span class="material-icons-round text-xl">edit</span>
                </button>
            </template>
        </div>
      </div>

      <div class="flex-1 overflow-hidden relative bg-white">
        
        <transition name="slide-fade">
        
        <div v-if="!showTagSelection" class="absolute inset-0 overflow-y-auto px-6 pb-8 pt-4 no-scrollbar">
            
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

            <div v-else class="space-y-6 pb-20">
                
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Название</label>
                    <input v-model="formData.name" placeholder="Название блюда" class="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 ring-indigo-500/10 border border-slate-100 text-lg">
                </div>

                <!-- MOVED INGREDIENTS HERE -->
                <div class="space-y-3">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Ингредиенты</label>
                    
                    <div v-if="formData.ingredients.length > 0" class="space-y-2">
                        <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex items-center gap-2 bg-white border border-slate-100 p-2 rounded-xl shadow-sm">
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-lg">🥦</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-slate-800 text-sm truncate">{{ ing.name }}</div>
                            </div>
                            <div class="bg-slate-50 px-2 py-1 rounded-lg text-xs font-bold text-slate-500">
                                {{ ing.amount }} {{ ing.unit }}
                            </div>
                            <button @click="removeIngredient(idx)" class="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors">
                                <span class="material-icons-round text-lg">close</span>
                            </button>
                        </div>
                    </div>

                    <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-3 relative">
                        <div v-if="!selectedProductToAdd">
                            <div class="relative">
                                <span class="material-icons-round absolute left-3 top-3 text-slate-400 text-lg">search</span>
                                <input 
                                    v-model="productSearchQuery" 
                                    @focus="showProductDropdown = true"
                                    @blur="setTimeout(() => showProductDropdown = false, 200)"
                                    placeholder="Добавить продукт..." 
                                    class="w-full pl-10 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-200 focus:border-indigo-300 transition-colors text-sm"
                                >
                                <div v-if="showProductDropdown && filteredProducts.length > 0" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-40 overflow-y-auto">
                                    <button 
                                        v-for="prod in filteredProducts" 
                                        :key="prod.id"
                                        @click="selectProductFromSearch(prod)"
                                        class="w-full text-left px-4 py-3 hover:bg-indigo-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between"
                                    >
                                        <span>{{ prod.name }}</span> <span class="text-xs text-slate-400">{{ prod.unit }}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="flex gap-2 items-center animate-fade-in">
                            <div class="flex-1 font-bold text-slate-800 text-sm pl-2 truncate">{{ selectedProductToAdd.name }}</div>
                            <input 
                                ref="quantityInput"
                                v-model="amountToAdd" 
                                type="number" 
                                inputmode="decimal"
                                :placeholder="selectedProductToAdd.unit" 
                                class="w-20 p-2 bg-white rounded-xl font-bold text-center outline-none border border-slate-200 focus:border-indigo-300 text-sm" 
                            >
                            <button @click="addIngredientToForm" class="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg tap-effect disabled:opacity-50" :disabled="!amountToAdd"><span class="material-icons-round">check</span></button>
                            <button @click="selectedProductToAdd = null" class="w-10 h-10 text-slate-400 flex items-center justify-center"><span class="material-icons-round">close</span></button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Тип блюда</label>
                        <div class="relative">
                            <select v-model="formData.dish_type_id" class="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm">
                                <option v-for="t in dictionaries.dishTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                            </select>
                            <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Прием пищи</label>
                        <div class="relative">
                            <select v-model="formData.meal_type_id" class="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm">
                                <option v-for="t in dictionaries.mealTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                            </select>
                            <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Свойства</label>
                    <button 
                        @click="openTagSelector"
                        class="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between group tap-effect hover:bg-slate-100 transition-colors"
                    >
                        <div class="flex flex-wrap gap-1.5 items-center">
                            <template v-if="formData.tags.length > 0">
                                <span v-for="tag in formData.tags" :key="tag.id" class="text-[11px] font-bold bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded-lg shadow-sm">
                                    {{ tag.icon }} {{ tag.name }}
                                </span>
                            </template>
                            <span v-else class="text-sm font-bold text-slate-400">Добавить теги...</span>
                        </div>
                        <span class="material-icons-round text-slate-300 group-hover:text-slate-500 transition-colors">chevron_right</span>
                    </button>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">КБЖУ (на порцию)</label>
                    <div class="grid grid-cols-4 gap-2">
                        <input v-model.number="formData.kcal" type="number" placeholder="Ккал" class="w-full p-3 bg-orange-50 text-orange-600 font-bold rounded-xl text-center outline-none border border-orange-100 placeholder:text-orange-200">
                        <input v-model.number="formData.protein" type="number" placeholder="Бел" class="w-full p-3 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 placeholder:text-slate-300">
                        <input v-model.number="formData.fat" type="number" placeholder="Жир" class="w-full p-3 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 placeholder:text-slate-300">
                        <input v-model.number="formData.carbs" type="number" placeholder="Угл" class="w-full p-3 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 placeholder:text-slate-300">
                    </div>
                </div>

                <div class="h-[1px] bg-slate-100 w-full"></div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Рецепт / Описание</label>
                    <textarea v-model="formData.description" placeholder="Опишите процесс приготовления..." class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-2 ring-indigo-500/10 border border-slate-100 min-h-[120px] text-sm"></textarea>
                </div>

                <div v-if="formData.id" class="pt-4 mt-4 border-t border-slate-100">
                    <button @click="handleDelete" class="w-full py-3 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <span class="material-icons-round">delete</span> Удалить блюдо
                    </button>
                </div>
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
</template>

<style scoped>
.animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

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

input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>
