<script setup>
import { ref, watch, computed } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan' // <--- Добавили импорт

const props = defineProps({
  isOpen: Boolean,
  dish: Object 
})

const emit = defineEmits(['close'])
const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const planStore = usePlanStore() // <--- Инициализировали стор плана

const isEditing = ref(false)
const formData = ref({
    id: null,
    name: '',
    dish_type: '', 
    meal_type: '', 
    description: '',
    kcal: null, protein: null, fat: null, carbs: null,
    tags: [],
    ingredients: []
})

// --- ЛОГИКА ТЕГОВ ---
const isTagSelected = (tag) => {
    return formData.value.tags.some(t => t.id === tag.id)
}

const toggleTag = (tag) => {
    if (isTagSelected(tag)) {
        formData.value.tags = formData.value.tags.filter(t => t.id !== tag.id)
    } else {
        formData.value.tags.push(tag)
    }
}

// --- ЛОГИКА ИНГРЕДИЕНТОВ ---
const productSearchQuery = ref('')
const showProductDropdown = ref(false)
const selectedProductToAdd = ref(null)
const amountToAdd = ref('')

const filteredProducts = computed(() => {
    const q = productSearchQuery.value.toLowerCase().trim()
    if (!q) return []
    return productStore.products
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 10)
})

const selectProductFromSearch = (prod) => {
    selectedProductToAdd.value = prod
    productSearchQuery.value = ''
    showProductDropdown.value = false
    amountToAdd.value = ''
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
}

const removeIngredient = (index) => {
    formData.value.ingredients.splice(index, 1)
}

// --- ИНИЦИАЛИЗАЦИЯ ---
watch(() => props.dish, (newVal) => {
  if (newVal) {
    formData.value = JSON.parse(JSON.stringify(newVal))
    if (!formData.value.ingredients) formData.value.ingredients = []
    if (!formData.value.tags) formData.value.tags = []
    
    // Режим создания или просмотра
    if (!formData.value.id) {
        if (!formData.value.dish_type) formData.value.dish_type = dictionaries.dishTypes[0]
        if (!formData.value.meal_type) formData.value.meal_type = dictionaries.mealTypes[1] 
        isEditing.value = true
    } else {
        isEditing.value = false
    }
    
    productSearchQuery.value = ''
    selectedProductToAdd.value = null
  }
}, { immediate: true })

const handleSave = async () => {
  if (!formData.value.name) return
  if (formData.value.id) {
    await dishStore.updateDish(formData.value.id, formData.value)
    // Если мы поменяли название или КБЖУ, план тоже стоит обновить, чтобы цифры пересчитались
    await planStore.fetchPlan() 
  } else {
    await dishStore.addDish(formData.value)
  }
  isEditing.value = false
  emit('close')
}

const handleDelete = async () => {
    if(confirm('Вы уверены, что хотите удалить это блюдо? Это удалит его из всех дней плана!')) {
        await dishStore.deleteDish(formData.value.id)
        
        // ВАЖНО: Обновляем план, чтобы убрать удаленное блюдо из сетки
        await planStore.fetchPlan()
        
        emit('close')
    }
}

const handleCancel = () => {
    if (!formData.value.id) emit('close')
    else {
        isEditing.value = false
        formData.value = JSON.parse(JSON.stringify(props.dish))
    }
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
    
    <div class="bg-white w-full max-w-sm h-[90vh] sm:h-auto sm:max-h-[90vh] rounded-t-[32px] sm:rounded-[32px] p-0 shadow-2xl relative z-10 flex flex-col overflow-hidden animate-slide-up">
      
      <div class="px-6 pt-6 pb-2 flex justify-between items-center shrink-0 border-b border-slate-50 bg-white z-20">
        <button v-if="!isEditing" @click="$emit('close')" class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 tap-effect hover:bg-slate-200">
            <span class="material-icons-round text-xl">close</span>
        </button>
        <div v-else class="w-10"></div>
        
        <span class="text-sm font-black text-slate-900 uppercase tracking-widest truncate max-w-[150px]">
            {{ isEditing ? (formData.id ? 'Редактирование' : 'Новое блюдо') : '' }}
        </span>

        <div class="flex items-center gap-2">
            <button v-if="isEditing" @click="handleCancel" class="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Отмена</button>
            <button v-if="isEditing" @click="handleSave" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect">Готово</button>
            <button v-if="!isEditing" @click="isEditing = true" class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center tap-effect hover:bg-indigo-100">
                 <span class="material-icons-round text-xl">edit</span>
            </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-6 pb-8 pt-4 no-scrollbar">
        
        <div v-if="!isEditing" class="flex flex-col space-y-6">
           <div class="text-center">
              <h2 class="text-2xl font-black text-slate-900 leading-tight mb-2">{{ formData.name }}</h2>
              <div class="flex flex-wrap justify-center gap-1.5">
                  <span class="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {{ formData.meal_type }}
                  </span>
                  <span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                      {{ formData.dish_type }}
                  </span>
                  <span v-for="tag in formData.tags" :key="tag.id" class="px-2 py-1 bg-indigo-50 text-indigo-500 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      #{{ tag.name }}
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

            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Тип блюда</label>
                    <div class="relative">
                        <select v-model="formData.dish_type" class="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm">
                            <option v-for="t in dictionaries.dishTypes" :key="t" :value="t">{{ t }}</option>
                        </select>
                        <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Прием пищи</label>
                    <div class="relative">
                        <select v-model="formData.meal_type" class="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm">
                            <option v-for="t in dictionaries.mealTypes" :key="t" :value="t">{{ t }}</option>
                        </select>
                        <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                    </div>
                </div>
            </div>

            <div class="space-y-1">
                <div class="flex justify-between items-center px-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Теги свойств</label>
                    <button class="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors">
                        Настроить
                    </button>
                </div>
                <div v-if="dictionaries.availableTags.length > 0" class="flex flex-wrap gap-2">
                    <button 
                        v-for="tag in dictionaries.availableTags" 
                        :key="tag.id" 
                        @click="toggleTag(tag)"
                        class="px-3 py-2 rounded-xl text-xs font-bold transition-all border tap-effect"
                        :class="isTagSelected(tag) ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-500 border-slate-200'"
                    >
                        {{ tag.name }}
                    </button>
                </div>
                <div v-else class="text-xs text-slate-400 italic pl-1">
                    Тегов пока нет. Добавьте их в настройках.
                </div>
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
                                placeholder="Добавить продукт..." 
                                class="w-full pl-10 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-200 focus:border-indigo-300 transition-colors text-sm"
                            >
                            
                            <div v-if="productSearchQuery && filteredProducts.length > 0" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-40 overflow-y-auto">
                                <button 
                                    v-for="prod in filteredProducts" 
                                    :key="prod.id"
                                    @click="selectProductFromSearch(prod)"
                                    class="w-full text-left px-4 py-3 hover:bg-indigo-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between"
                                >
                                    <span>{{ prod.name }}</span>
                                     <span class="text-xs text-slate-400">{{ prod.unit }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div v-else class="flex gap-2 items-center animate-fade-in">
                        <div class="flex-1 font-bold text-slate-800 text-sm pl-2 truncate">{{ selectedProductToAdd.name }}</div>
                        <input v-model="amountToAdd" type="number" :placeholder="selectedProductToAdd.unit" class="w-20 p-2 bg-white rounded-xl font-bold text-center outline-none border border-slate-200 focus:border-indigo-300 text-sm" autoFocus>
                        <button @click="addIngredientToForm" class="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg tap-effect disabled:opacity-50" :disabled="!amountToAdd"><span class="material-icons-round">check</span></button>
                        <button @click="selectedProductToAdd = null" class="w-10 h-10 text-slate-400 flex items-center justify-center"><span class="material-icons-round">close</span></button>
                    </div>
                </div>
            </div>

            <div class="h-[1px] bg-slate-100 w-full"></div>

            <div class="space-y-1">
                <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Рецепт / Описание</label>
                <textarea 
                    v-model="formData.description" 
                    placeholder="Опишите процесс приготовления..." 
                    class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-2 ring-indigo-500/10 border border-slate-100 min-h-[120px] text-sm"
                ></textarea>
            </div>

            <div v-if="formData.id" class="pt-4 mt-4 border-t border-slate-100">
                <button 
                    @click="handleDelete" 
                    class="w-full py-3 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                    <span class="material-icons-round">delete</span>
                    Удалить блюдо
                </button>
            </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.animate-fade-in { animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>