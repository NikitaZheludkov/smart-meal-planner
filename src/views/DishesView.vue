<script setup>
import { ref, onMounted, computed } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'

const dishStore = useDishStore()
const productStore = useProductStore()

const searchQuery = ref('')
const activeCategory = ref('Все')
const categories = ['Все', 'Завтрак', 'Обед', 'Ужин', 'Перекус', 'Салат', 'Гарнир']

// --- ЛОГИКА КАРТОЧКИ ---
const showDetailModal = ref(false)
const isEditing = ref(false)
const viewingDish = ref(null)

// Для добавления ингредиентов
const selectedProduct = ref('')
const amount = ref(1)

// Открыть карточку (только просмотр)
const openDish = (dish) => {
  viewingDish.value = { ...dish } // Копируем объект, чтобы не менять оригинал сразу
  isEditing.value = false
  showDetailModal.value = true
}

// Включить редактирование
const startEditing = () => {
  isEditing.value = true
}

// Сохранить изменения
const saveChanges = async () => {
  await dishStore.updateDish(viewingDish.value.id, {
    name: viewingDish.value.name,
    category: viewingDish.value.category,
    description: viewingDish.value.description,
    kcal: viewingDish.value.kcal,
    protein: viewingDish.value.protein,
    fat: viewingDish.value.fat,
    carbs: viewingDish.value.carbs
  })
  isEditing.value = false
  // Обновляем список
  await dishStore.fetchDishes()
}

// Работа с ингредиентами
const addIngToDish = async () => {
  if (!selectedProduct.value || !amount.value) return
  await dishStore.addIngredient(viewingDish.value.id, selectedProduct.value, amount.value)
  // Обновляем локальную копию
  const updated = dishStore.dishes.find(d => d.id === viewingDish.value.id)
  if (updated) viewingDish.value.ingredients = updated.ingredients
  selectedProduct.value = ''
}

const removeIng = async (id) => {
  await dishStore.removeIngredient(viewingDish.value.id, id)
  const updated = dishStore.dishes.find(d => d.id === viewingDish.value.id)
  if (updated) viewingDish.value.ingredients = updated.ingredients
}

// --- СОЗДАНИЕ НОВОГО ---
const showCreateModal = ref(false)
const newDish = ref({ name: '', category: 'Обед' })

const createDish = async () => {
  if (!newDish.value.name) return
  await dishStore.addDish(newDish.value)
  showCreateModal.value = false
  newDish.value = { name: '', category: 'Обед' }
}

onMounted(async () => {
  if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
  if (productStore.products.length === 0) await productStore.fetchProducts()
})

const filteredDishes = computed(() => {
  let result = dishStore.dishes
  if (activeCategory.value !== 'Все') result = result.filter(d => d.category === activeCategory.value)
  if (searchQuery.value) result = result.filter(d => d.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
  return result
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    <div class="bg-slate-50 pt-12 pb-2 px-5 sticky top-0 z-20">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-4">Блюда</h1>
      <div class="relative mb-4">
        <span class="material-icons-round absolute left-4 top-3.5 text-slate-400">search</span>
        <input v-model="searchQuery" type="text" placeholder="Найти рецепт..." class="w-full pl-11 p-3.5 bg-white rounded-2xl font-bold text-slate-800 outline-none shadow-sm focus:ring-2 ring-slate-900/10 transition-all">
      </div>
      <div class="flex overflow-x-auto gap-2 no-scrollbar pb-2">
        <button v-for="cat in categories" :key="cat" @click="activeCategory = cat" class="whitespace-nowrap px-5 py-2.5 rounded-2xl text-xs font-bold transition-all tap-effect" :class="activeCategory === cat ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 shadow-sm'">{{ cat }}</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-32 space-y-3 pt-2">
      <div v-if="filteredDishes.length === 0" class="text-center py-20 opacity-40">
        <div class="text-5xl mb-2">🍳</div>
        <p class="font-bold text-slate-400">Нет блюд</p>
      </div>

      <div v-for="dish in filteredDishes" :key="dish.id" @click="openDish(dish)" class="bg-white p-5 rounded-[24px] shadow-sm flex flex-col gap-2 tap-effect border border-slate-100/50">
        <div class="flex justify-between items-start">
          <span class="font-bold text-lg text-slate-900 leading-tight">{{ dish.name }}</span>
          <span class="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-wider">{{ dish.category }}</span>
        </div>
        <div class="flex gap-3 text-[10px] font-bold text-slate-400 mt-1">
           <span class="text-orange-500">🔥 {{ dish.kcal || 0 }}</span>
           <span>Б {{ dish.protein || 0 }}</span>
           <span>Ж {{ dish.fat || 0 }}</span>
           <span>У {{ dish.carbs || 0 }}</span>
        </div>
      </div>
    </div>

    <div class="fixed bottom-24 right-5 z-30">
      <button @click="showCreateModal = true" class="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center tap-effect hover:scale-105 transition-transform"><span class="material-icons-round text-3xl">add</span></button>
    </div>

    <transition name="modal">
      <div v-if="showDetailModal" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="showDetailModal = false">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
        <div class="bg-white w-full max-w-sm h-[90vh] sm:h-auto rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative z-10 flex flex-col mb-safe animate-slide-up no-scrollbar overflow-hidden">
          
          <div class="flex justify-between items-center mb-6 shrink-0">
             <button @click="showDetailModal = false" class="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center tap-effect hover:bg-slate-100">
               <span class="material-icons-round">keyboard_arrow_down</span>
             </button>
             
             <button v-if="!isEditing" @click="startEditing" class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center tap-effect hover:bg-indigo-100">
               <span class="material-icons-round text-lg">edit</span>
             </button>
             <button v-else @click="saveChanges" class="px-4 h-10 rounded-full bg-slate-900 text-white font-bold text-xs tap-effect">
               Готово
             </button>
          </div>

          <div class="overflow-y-auto no-scrollbar pb-10">
            
            <div v-if="!isEditing">
              <div class="text-[10px] font-bold tracking-widest bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full inline-block mb-3 uppercase border border-emerald-100">{{ viewingDish?.category }}</div>
              <h3 class="text-3xl font-bold text-slate-900 leading-tight mb-6">{{ viewingDish?.name }}</h3>
              
              <div class="grid grid-cols-4 gap-2 mb-6">
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.kcal || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">ккал</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.protein || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">белки</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.fat || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">жиры</div>
                </div>
                <div class="bg-slate-50 rounded-2xl p-2 text-center border border-slate-100">
                  <div class="text-lg font-black text-slate-900">{{ viewingDish?.carbs || 0 }}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase">угле</div>
                </div>
              </div>

              <div v-if="viewingDish?.description" class="mb-6">
                 <h4 class="text-xs font-bold text-slate-900 uppercase mb-2 ml-1">Описание</h4>
                 <div class="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 leading-relaxed font-medium border border-slate-100">
                   {{ viewingDish.description }}
                 </div>
              </div>

              <div>
                <h4 class="text-xs font-bold text-slate-900 uppercase mb-3 ml-1 flex justify-between">
                  Ингредиенты <span class="text-slate-400">{{ viewingDish?.ingredients?.length || 0 }}</span>
                </h4>
                <div class="space-y-2">
                   <div v-if="!viewingDish?.ingredients?.length" class="text-slate-400 text-sm py-4 italic">Список пуст</div>
                   <div v-for="ing in viewingDish?.ingredients" :key="ing.id" class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                      <span class="font-bold text-slate-700">{{ ing.products?.name }}</span>
                      <span class="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg text-xs">{{ ing.amount }} {{ ing.products?.unit }}</span>
                   </div>
                </div>
              </div>
            </div>

            <div v-else class="space-y-5">
               <div>
                 <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Название</label>
                 <input v-model="viewingDish.name" type="text" class="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 ring-slate-900/10">
               </div>

               <div>
                 <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Категория</label>
                 <div class="flex overflow-x-auto gap-2 mt-1 no-scrollbar">
                    <button v-for="cat in categories.slice(1)" :key="cat" @click="viewingDish.category = cat" class="px-4 py-2 rounded-xl text-xs font-bold border transition-all" :class="viewingDish.category === cat ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'">{{ cat }}</button>
                 </div>
               </div>

               <div class="grid grid-cols-4 gap-2">
                  <div class="space-y-1">
                    <label class="text-[9px] font-bold text-center block text-slate-400">ККАЛ</label>
                    <input v-model="viewingDish.kcal" type="number" class="w-full p-2 bg-slate-50 rounded-xl font-black text-center text-slate-900 outline-none">
                  </div>
                  <div class="space-y-1">
                    <label class="text-[9px] font-bold text-center block text-slate-400">БЕЛКИ</label>
                    <input v-model="viewingDish.protein" type="number" class="w-full p-2 bg-slate-50 rounded-xl font-black text-center text-slate-900 outline-none">
                  </div>
                  <div class="space-y-1">
                    <label class="text-[9px] font-bold text-center block text-slate-400">ЖИРЫ</label>
                    <input v-model="viewingDish.fat" type="number" class="w-full p-2 bg-slate-50 rounded-xl font-black text-center text-slate-900 outline-none">
                  </div>
                  <div class="space-y-1">
                    <label class="text-[9px] font-bold text-center block text-slate-400">УГЛЕ</label>
                    <input v-model="viewingDish.carbs" type="number" class="w-full p-2 bg-slate-50 rounded-xl font-black text-center text-slate-900 outline-none">
                  </div>
               </div>

               <div>
                 <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Описание</label>
                 <textarea v-model="viewingDish.description" rows="3" class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-sm text-slate-900 outline-none focus:ring-2 ring-slate-900/10 resize-none" placeholder="Как готовить..."></textarea>
               </div>

               <div class="bg-slate-100 p-4 rounded-[24px]">
                 <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Ингредиенты</label>
                 
                 <div class="space-y-2 mb-4">
                    <div v-for="ing in viewingDish.ingredients" :key="ing.id" class="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm">
                       <span class="font-bold text-slate-700 text-sm">{{ ing.products?.name }}</span>
                       <div class="flex items-center gap-3">
                         <span class="text-xs font-bold text-slate-400">{{ ing.amount }} {{ ing.products?.unit }}</span>
                         <button @click="removeIng(ing.id)" class="text-red-400"><span class="material-icons-round text-sm">remove_circle</span></button>
                       </div>
                    </div>
                 </div>

                 <div class="flex gap-2">
                    <select v-model="selectedProduct" class="flex-1 bg-white p-3 rounded-xl text-xs font-bold text-slate-800 outline-none"><option value="" disabled>Продукт...</option><option v-for="p in productStore.products" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                    <input v-model="amount" type="number" class="w-16 bg-white p-3 rounded-xl text-center font-bold text-xs outline-none" placeholder="1">
                    <button @click="addIngToDish" :disabled="!selectedProduct" class="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"><span class="material-icons-round text-lg">add</span></button>
                 </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </transition>

    <transition name="modal">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="showCreateModal = false">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
        <div class="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative z-10 mb-safe animate-slide-up">
          <div class="modal-handle"></div>
          <h3 class="text-2xl font-bold text-slate-900 mb-6">Новое блюдо</h3>
          <input v-model="newDish.name" type="text" placeholder="Название" class="w-full p-4 rounded-2xl bg-slate-100 mb-4 font-bold outline-none text-slate-900">
          <div class="grid grid-cols-2 gap-2 mb-6">
            <button v-for="cat in categories.slice(1)" :key="cat" @click="newDish.category = cat" class="py-3 rounded-xl text-xs font-bold border transition-all" :class="newDish.category === cat ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-400'">{{ cat }}</button>
          </div>
          <button @click="createDish" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl tap-effect">Создать</button>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.3s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>