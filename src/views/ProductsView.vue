<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProductStore } from '../stores/products'
import { useTelegramStore } from '../stores/telegram'
import ProductDetailModal from '../components/ProductDetailModal.vue'

const productStore = useProductStore()
const telegram = useTelegramStore()

const searchQuery = ref('')
const selectedCategory = ref('Все')

// Состояние модалки
const showProductModal = ref(false)
const selectedProduct = ref(null)

const createProduct = () => {
    telegram.haptic.impact('light')
    selectedProduct.value = {} 
    showProductModal.value = true
}

const openProduct = (product) => {
    telegram.haptic.selection()
    selectedProduct.value = product
    showProductModal.value = true
}

const categories = computed(() => {
    const cats = new Set(productStore.products.map(p => p.category || 'Разное'))
    return ['Все', ...Array.from(cats).sort()]
})

const filteredProducts = computed(() => {
    let result = productStore.products
    
    if (selectedCategory.value !== 'Все') {
        result = result.filter(p => (p.category || 'Разное') === selectedCategory.value)
    }
    
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        result = result.filter(p => p.name.toLowerCase().includes(q))
    }
    
    return result
})

onMounted(async () => {
    if (productStore.products.length === 0) {
        await productStore.fetchProducts()
    }
})
</script>

<template>
  <div class="h-full bg-slate-50 flex flex-col relative">
    
    <div class="px-5 pt-6 pb-4 bg-white rounded-b-[32px] shadow-sm z-10 shrink-0">
        <h1 class="text-2xl font-black text-slate-900 mb-4 tracking-tight">Продукты</h1>
        
        <div class="relative mb-4">
            <span class="material-icons-round absolute left-4 top-3.5 text-slate-400">search</span>
            <input 
                v-model="searchQuery" 
                placeholder="Найти продукт..." 
                class="w-full pl-11 pr-4 py-3.5 bg-slate-50 rounded-2xl font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 ring-indigo-500/10 transition-all border border-slate-100"
            >
        </div>

        <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button 
                v-for="cat in categories" 
                :key="cat"
                @click="selectedCategory = cat; telegram.haptic.selection()"
                class="whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all border"
                :class="selectedCategory === cat ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-[1.02]' : 'bg-white text-slate-500 border-slate-200'"
            >
                {{ cat }}
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pt-4 pb-28 space-y-3">
        <div v-if="productStore.loading" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-300">sync</span>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="text-center py-10 opacity-50">
            <div class="text-4xl mb-2">🥦</div>
            <p class="text-sm font-bold">Список пуст</p>
        </div>

        <div 
            v-for="product in filteredProducts" 
            :key="product.id" 
            @click="openProduct(product)"
            class="bg-white p-3 rounded-[20px] shadow-sm border border-slate-100 flex items-center gap-3 tap-effect active:scale-[0.98] transition-transform"
        >
            <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl shrink-0">
                🥦
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 truncate">{{ product.name }}</div>
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{{ product.category || 'Разное' }}</div>
            </div>
            <div class="px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold text-slate-500">
                {{ product.unit }}
            </div>
        </div>
    </div>

    <button 
        @click="createProduct"
        class="fixed bottom-24 right-5 w-14 h-14 bg-slate-900 rounded-full shadow-xl shadow-slate-900/30 flex items-center justify-center text-white tap-effect active:scale-90 transition-transform z-50"
    >
        <span class="material-icons-round text-2xl">add</span>
    </button>

    <ProductDetailModal 
        :is-open="showProductModal" 
        :product="selectedProduct" 
        @close="showProductModal = false" 
    />
    
  </div>
</template>