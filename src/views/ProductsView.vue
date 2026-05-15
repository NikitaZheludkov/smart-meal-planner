<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProductStore } from '../stores/products'
import { useTelegramStore } from '../stores/telegram'
import { useDictionariesStore } from '../stores/dictionaries'
import ProductDetailModal from '../components/ProductDetailModal.vue'

const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  }
})

const productStore = useProductStore()
const telegram = useTelegramStore()
const dictionaries = useDictionariesStore()

const selectedCategory = ref('Все')

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
    
    if (props.searchQuery) {
        const q = props.searchQuery.toLowerCase()
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
    
    <div class="bg-white border-b border-slate-100 px-5 pb-4 flex flex-col justify-between">
        
        <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button 
                v-for="cat in categories" 
                :key="cat"
                @click="selectedCategory = cat; telegram.haptic.selection()"
                class="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-colors border"
                :class="selectedCategory === cat ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200'"
            >
                {{ cat }}
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pt-4 pb-app-nav scroll-area w-full">
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
        class="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px)+16px)] right-5 w-14 h-14 bg-slate-900 rounded-full shadow-xl shadow-slate-900/30 flex items-center justify-center text-white tap-effect active:scale-90 transition-transform z-50"
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
