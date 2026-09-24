<script setup>
import { formatUnit } from '../lib/utils'
import { ref, computed, onMounted, watch } from 'vue'
import { useProductStore } from '../stores/products'
import { usePlatformStore } from '../stores/platform'
import { useDictionariesStore } from '../stores/dictionaries'
import { useUIStore } from '../stores/ui'
import ProductDetailModal from '../components/ProductDetailModal.vue'

const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  }
})

const productStore = useProductStore()
const platform = usePlatformStore()
const dictionaries = useDictionariesStore()
const uiStore = useUIStore()

const showProductModal = ref(false)
const selectedProduct = ref(null)

const categoryIcons = {
    'Овощи и фрукты': '🥦',
    'Молочные продукты': '🥛',
    'Мясо, птица, рыба': '🥩',
    'Хлеб': '🍞',
    'Крупы, макароны': '🌾',
    'Напитки': '🥤',
    'Бытовая химия': '🧼',
    'Соусы': '🧂',
    'Разное': '📦'
}

const getCategoryIcon = (categoryName) => {
    return categoryIcons[categoryName] || '📦'
}

const createProduct = () => {
    platform.haptic.impact('light')
    selectedProduct.value = {} 
    showProductModal.value = true
}

const openProduct = (product) => {
    platform.haptic.selection()
    selectedProduct.value = product
    showProductModal.value = true
}

// Если открытый продукт удалили (например, с другого устройства через
// realtime), закрываем модалку, иначе сохранение/удаление будет бить в
// несуществующий id.
watch(() => productStore.products, (products) => {
  const openedId = selectedProduct.value?.id
  if (!showProductModal.value || !openedId) return
  const stillExists = products.some((p) => p.id === openedId)
  if (!stillExists) {
    showProductModal.value = false
    selectedProduct.value = null
    uiStore.showToast('Этот продукт был удалён', 'info')
  }
})

const filteredProducts = computed(() => {
    let result = productStore.products
    
    if (uiStore.products.activeCategory !== 'Все') {
        result = result.filter(p => (p.category || 'Разное') === uiStore.products.activeCategory)
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

    <div class="flex-1 overflow-y-auto px-5 pt-4 pb-app-nav scroll-area w-full">
        <div v-if="productStore.loading" class="flex justify-center py-10">
            <span class="material-icons-round animate-spin text-slate-900">sync</span>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="empty-state-container">
            <div class="empty-state-icon">
                <span class="material-icons-round" style="font-size: 64px;">search_off</span>
            </div>
            <p class="empty-state-title">Ничего не найдено</p>
        </div>

        <div v-else class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative p-0.5">
            <div 
                v-for="product in filteredProducts" 
                :key="product.id" 
                @click="openProduct(product)"
                class="flex items-center px-3 py-1.5 w-full min-h-[40px] border-b border-slate-50 last:border-0 tap-effect active:bg-slate-50 transition-colors rounded-xl"
            >
                <div class="w-7 h-7 flex items-center justify-center text-base mr-2.5 bg-slate-50 rounded-[10px] shrink-0">
                    {{ getCategoryIcon(product.category) }}
                </div>
                
                <div class="flex-1 min-w-0 card-title truncate pr-2 leading-tight">
                    {{ product.name }}
                </div>
                
                <div class="text-[10px] font-normal text-secondary bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 whitespace-nowrap flex-shrink-0">
                    {{ formatUnit(product.unit) }}
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
