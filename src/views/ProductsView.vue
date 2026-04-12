<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProductStore } from '../stores/products'
import { useTelegramStore } from '../stores/telegram'
import { useDictionariesStore } from '../stores/dictionaries'
import ProductDetailModal from '../components/ProductDetailModal.vue'

const productStore = useProductStore()
const telegram = useTelegramStore()
const dictionaries = useDictionariesStore()

const searchQuery = ref('')
const selectedCategory = ref('Все')

// Состояние модалки
const showProductModal = ref(false)
const selectedProduct = ref(null)

const categoryIcons = {
    'Овощи и фрукты': '🥦',
    'Молочные продукты': '🥛',
    'Мясо, птица, рыба': '🥩',
    'Бакалея и хлеб': '🍞',
    'Заморозка': '🧊',
    'Напитки': '🥤',
    'Бытовая химия': '🧼',
    'Разное': '📦'
}

const getCategoryIcon = (categoryName) => {
    return categoryIcons[categoryName] || '📦'
}

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
    const tasks = []
    if (productStore.products.length === 0) tasks.push(productStore.fetchProducts())
    tasks.push(dictionaries.fetchDictionaries())
    await Promise.all(tasks)
})
</script>

<template>
  <div class="h-full bg-slate-50 flex flex-col relative">
    
    <div class="bg-white rounded-b-[32px] shadow-sm z-20 relative border-b border-slate-100 px-5 pt-app-header pb-4 h-[185px] flex flex-col justify-between">
        
        <h1 class="app-title">Продукты</h1>

        <div class="relative">
            <span class="material-icons-outlined absolute left-4 top-3 text-slate-400">search</span>
            <input 
                v-model="searchQuery" 
                placeholder="Поиск по базе..." 
                class="w-full pl-11 pr-10 py-2.5 bg-slate-50 rounded-2xl font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 ring-slate-900/10 transition-all border border-slate-100"
            >
            <button 
                v-if="searchQuery" 
                @click="searchQuery = ''"
                class="absolute right-4 top-3 text-slate-400 hover:text-slate-600 tap-effect"
            >
                <span class="material-icons-round text-lg">close</span>
            </button>
        </div>

        <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button 
                v-for="cat in categories" 
                :key="cat"
                @click="selectedCategory = cat; telegram.haptic.selection()"
                class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-all border"
                :class="selectedCategory === cat ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200'"
            >
                {{ cat }}
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pt-4 pb-[76px] scroll-area w-full">
        <div v-if="productStore.loading" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-900">sync</span>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="text-center py-10 opacity-50">
            <div class="text-4xl mb-2">🥦</div>
            <p class="text-sm font-bold">Список пуст</p>
        </div>

        <div v-else class="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden relative p-1">
            <div 
                v-for="product in filteredProducts" 
                :key="product.id" 
                @click="openProduct(product)"
                class="flex items-center px-4 py-3 w-full min-h-[52px] border-b border-slate-50 last:border-0 tap-effect active:bg-slate-50 transition-colors rounded-xl"
            >
                <div class="w-9 h-9 flex items-center justify-center text-lg mr-3 bg-slate-50 rounded-[14px] shrink-0">
                    {{ getCategoryIcon(product.category) }}
                </div>
                
                <div class="flex-1 min-w-0 card-title truncate pr-2 leading-tight">
                    {{ product.name }}
                </div>
                
                <div class="text-[10px] font-normal text-secondary bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 whitespace-nowrap flex-shrink-0">
                    {{ product.unit }}
                </div>
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
