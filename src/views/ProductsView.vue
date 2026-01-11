<script setup>
import { ref, onMounted, computed } from 'vue'
import { useProductStore } from '../stores/products'

const store = useProductStore()
const searchQuery = ref('')

const showModal = ref(false)
const isEditing = ref(false)
const form = ref({ id: null, name: '', unit: 'кг' })

const units = ['кг', 'г', 'л', 'мл', 'шт', 'уп']

const openCreate = () => {
  isEditing.value = false
  form.value = { id: null, name: '', unit: 'шт' }
  showModal.value = true
}

const openEdit = (product) => {
  isEditing.value = true
  form.value = { ...product }
  showModal.value = true
}

const save = async () => {
  if (!form.value.name) return
  if (isEditing.value) {
    await store.updateProduct(form.value)
  } else {
    await store.addProduct(form.value)
  }
  showModal.value = false
}

const remove = async (id) => {
  if(confirm('Удалить продукт?')) await store.deleteProduct(id)
  showModal.value = false
}

onMounted(() => {
  if (store.products.length === 0) store.fetchProducts()
})

const filteredProducts = computed(() => {
  if (!searchQuery.value) return store.products
  return store.products.filter(p => p.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50">
    
    <div class="bg-slate-50 pt-12 pb-2 px-5 sticky top-0 z-20">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-4">Продукты</h1>
      
      <div class="relative mb-2">
        <span class="material-icons-round absolute left-4 top-3.5 text-slate-400">search</span>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Найти продукт..." 
          class="w-full pl-11 p-3.5 bg-white rounded-2xl font-bold text-slate-800 outline-none shadow-sm focus:ring-2 ring-slate-900/10 transition-all"
        >
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-32 space-y-3 pt-2">
      
      <div v-if="filteredProducts.length === 0" class="text-center py-20 opacity-40">
        <div class="text-5xl mb-2">🥕</div>
        <p class="font-bold text-slate-400">Список пуст</p>
      </div>

      <div 
        v-for="product in filteredProducts" 
        :key="product.id"
        class="bg-white p-4 rounded-[20px] shadow-sm flex items-center justify-between border border-slate-100/50 tap-effect"
        @click="openEdit(product)"
      >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-bold text-xs text-slate-400 uppercase">
             {{ product.name.substring(0,1) }}
          </div>
          <div>
            <div class="font-bold text-slate-900 text-[15px]">{{ product.name }}</div>
            <div class="text-[10px] font-bold text-slate-400">Базовый ингредиент</div>
          </div>
        </div>

        <div class="font-bold text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg uppercase">
          {{ product.unit }}
        </div>
      </div>

    </div>

    <div class="fixed bottom-24 right-5 z-30">
      <button 
        @click="openCreate"
        class="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center tap-effect hover:scale-105 transition-transform"
      >
        <span class="material-icons-round text-3xl">add</span>
      </button>
    </div>

    <transition name="modal">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="showModal = false">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
        <div class="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative z-10 mb-safe animate-slide-up">
          <div class="modal-handle"></div>
          
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-bold text-slate-900">{{ isEditing ? 'Продукт' : 'Новый продукт' }}</h3>
            <button v-if="isEditing" @click="remove(form.id)" class="bg-red-50 text-red-500 p-2 rounded-xl"><span class="material-icons-round text-sm">delete</span></button>
          </div>
          
          <div class="space-y-5">
            <div>
              <input v-model="form.name" type="text" placeholder="Название (напр. Морковь)" class="w-full p-4 rounded-2xl bg-slate-100 font-bold outline-none text-slate-900 placeholder:text-slate-400 focus:ring-2 ring-slate-900/10">
            </div>

            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Единица измерения</label>
              <div class="grid grid-cols-6 gap-2">
                <button 
                  v-for="u in units" 
                  :key="u"
                  @click="form.unit = u"
                  class="py-2 rounded-xl text-xs font-bold border transition-all"
                  :class="form.unit === u ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-400'"
                >
                  {{ u }}
                </button>
              </div>
            </div>

            <button @click="save" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl tap-effect mt-4">
              Сохранить
            </button>
          </div>

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