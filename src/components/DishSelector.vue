<script setup>
import { ref, computed } from 'vue'
import { useDishStore } from '../stores/dishes'
import { usePlanStore } from '../stores/plan'
import { useProductStore } from '../stores/products'
import { useSettingsStore } from '../stores/settings'
import { useTelegramStore } from '../stores/telegram' // <-- Импорт

const props = defineProps({
  preferredCategory: String, 
  suggestedItems: { type: Array, default: () => [] }, 
  existingItems: { type: Array, default: () => [] }, 
})

const emit = defineEmits(['close', 'select', 'remove', 'toggle-shopping'])
const dishStore = useDishStore()
const planStore = usePlanStore()
const productStore = useProductStore()
const settingsStore = useSettingsStore()
const telegram = useTelegramStore() // <-- Инит

const searchQuery = ref('')
const activeTab = ref('dishes') 

// --- ЛОГИКА ---
// ВАЖНО: У нас теперь preferredCategory - это Имя, а в блюдах хранятся ID. 
// Но логика "рек" пока останется простой, чтобы не усложнять.
const isContextMatch = (dish) => {
    // В будущем можно доработать, пока просто возвращаем false или упрощенную проверку
    return false 
}

const sortedDishes = computed(() => {
  const q = searchQuery.value.toLowerCase()
  let list = [...dishStore.dishes]
  
  if (q) {
    list = list.filter(d => d.name.toLowerCase().includes(q))
  }
  return list
})

const filteredProducts = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return [] 
  return productStore.products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10)
})

// --- ДЕЙСТВИЯ ---
const handleAdd = (item, type = 'dish') => {
    // Успешная вибрация!
    telegram.haptic.notification('success')
    
    const defaultPortions = settingsStore.defaultPortions || 1
    emit('select', { 
        ...item, 
        type,
        amount: defaultPortions,
        ignore_shopping: false 
    })
}

const updatePortions = (item, delta) => {
    telegram.haptic.selection() // Легкий щелчок
    const newAmount = Math.max(1, (item.portions || 1) + delta)
    planStore.updatePlanItem(item.id, { portions: newAmount })
}

const toggleShopping = (item) => {
    telegram.haptic.impact('medium')
    planStore.updatePlanItem(item.id, { ignore_shopping: !item.ignore_shopping })
}

const removeItem = (item) => {
    telegram.haptic.notification('warning') // Предупреждающая вибрация при удалении
    planStore.removeFromPlan(item.id)
}

const isValidItem = (item) => {
    if (item.dish_id) return !!item.dishes; 
    if (item.product_id) return !!item.products; 
    return false;
}
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
    
    <div class="bg-white w-full max-w-md h-[92vh] sm:h-[800px] rounded-t-[32px] sm:rounded-[32px] shadow-2xl relative z-10 flex flex-col overflow-hidden animate-slide-up">
      
      <div class="px-5 pt-5 pb-3 bg-white z-20 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div>
              <h2 class="text-xl font-black text-slate-900">{{ preferredCategory || 'Выбор блюда' }}</h2>
              <p class="text-[11px] font-bold text-slate-400">Составьте меню для этого приема</p>
          </div>
          <button @click="$emit('close')" class="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold tap-effect shadow-lg shadow-slate-900/20">
              Готово
          </button>
      </div>

      <div class="flex-1 overflow-y-auto bg-slate-50">
           
          <div v-if="existingItems.length > 0" class="px-4 py-3 space-y-2">
              <div class="flex items-center gap-2 mb-1">
                  <span class="material-icons-round text-sm text-indigo-500">restaurant</span>
                  <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest">Выбрано</h3>
              </div>
               
              <div class="space-y-2">
                <template v-for="item in existingItems" :key="item.id">
                    <div 
                        v-if="isValidItem(item)"
                        class="bg-white p-2.5 rounded-2xl shadow-sm border border-slate-100 flex gap-3 overflow-hidden"
                    >
                        <div class="flex-1 flex flex-col gap-2.5 min-w-0">
                            
                            <div class="flex items-center justify-between gap-2 h-8">
                                <div class="font-bold text-slate-900 text-sm truncate leading-tight">
                                     {{ item.dish_id ? item.dishes?.name : item.products?.name }}
                                </div>
                                
                                <div class="flex items-center bg-slate-50 rounded-lg h-full border border-slate-100 shrink-0 px-0.5">
                                     <button @click="updatePortions(item, -1)" class="w-8 h-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform disabled:opacity-30 hover:text-slate-600">
                                         <span class="material-icons-round text-sm">remove</span>
                                     </button>
                                     <div class="text-xs font-black text-slate-700 w-5 text-center">
                                         {{ item.portions }}
                                     </div>
                                     <button @click="updatePortions(item, 1)" class="w-8 h-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform hover:text-slate-600">
                                         <span class="material-icons-round text-sm">add</span>
                                     </button>
                                </div>
                            </div>

                            <button 
                                @click="toggleShopping(item)"
                                class="h-7 w-full rounded-lg flex items-center justify-center gap-1.5 transition-all tap-effect border"
                                :class="!item.ignore_shopping 
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                    : 'bg-slate-50 border-slate-100 text-slate-400'"
                            >
                                <span v-if="!item.ignore_shopping" class="material-icons-round text-sm">check</span>
                                <span v-else class="material-icons-round text-sm">remove_shopping_cart</span>
                                
                                <span class="text-[9px] font-black uppercase tracking-wide pt-0.5">
                                    {{ !item.ignore_shopping ? 'ДОБАВИТЬ В СПИСОК ПОКУПОК' : 'НЕ ПОКУПАТЬ' }}
                                </span>
                            </button>
                        </div>

                        <div class="w-[1px] bg-slate-50 my-1"></div>
                        
                        <button 
                            @click="removeItem(item)" 
                            class="w-8 flex items-center justify-center text-slate-300 hover:text-red-500 active:bg-red-50 active:text-red-500 rounded-xl transition-colors shrink-0 self-stretch tap-effect"
                        >
                            <span class="material-icons-round text-xl">delete</span>
                        </button>

                    </div>
                </template>
              </div>
          </div>

          <div v-if="suggestedItems.length > 0" class="px-4 pb-4 pt-2">
               <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Было вчера</h3>
               <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                   <template v-for="item in suggestedItems" :key="'sug'+item.id">
                       <button 
                          v-if="isValidItem(item)"
                          @click="handleAdd(item.dish_id ? item.dishes : item.products, item.dish_id ? 'dish' : 'product')"
                          class="min-w-[140px] max-w-[140px] bg-white p-2 rounded-2xl border border-slate-100 flex flex-col items-center text-center gap-2 tap-effect"
                       >
                           <div class="w-12 h-12 rounded-xl bg-slate-50 overflow-hidden flex-shrink-0 flex items-center justify-center text-xl">
                                <img v-if="item.dish_id && item.dishes?.image_url" :src="item.dishes.image_url" class="w-full h-full object-cover">
                                <span v-else>{{ item.product_id ? '🥦' : '🥘' }}</span>
                           </div>
                           <div class="font-bold text-slate-800 text-xs leading-tight line-clamp-2">
                               {{ item.dish_id ? item.dishes?.name : item.products?.name }}
                           </div>
                           <span class="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md w-full">Добавить +</span>
                       </button>
                   </template>
               </div>
          </div>

          <div class="bg-white rounded-t-[32px] shadow-[0_-4px_20px_rgba(0,0,0,0.03)] min-h-[400px] px-5 pt-6 pb-20">
               
               <div class="relative mb-6">
                  <span class="material-icons-round absolute left-3 top-3.5 text-slate-400">search</span>
                  <input v-model="searchQuery" placeholder="Найти рецепт или продукт..." class="w-full pl-10 p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/10 transition-all border border-slate-100">
               </div>

               <div v-if="searchQuery" class="flex gap-2 mb-4">
                   <button @click="activeTab = 'dishes'" class="px-4 py-2 rounded-xl text-xs font-bold transition-colors border" :class="activeTab === 'dishes' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'">Блюда</button>
                   <button @click="activeTab = 'products'" class="px-4 py-2 rounded-xl text-xs font-bold transition-colors border" :class="activeTab === 'products' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'">Продукты</button>
               </div>
               
               <div v-else class="flex items-center gap-2 mb-4">
                  <span class="material-icons-round text-sm text-indigo-500">menu_book</span>
                  <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest">Все рецепты</h3>
               </div>

               <div v-if="activeTab === 'dishes'" class="space-y-2">
                   <div 
                      v-for="dish in sortedDishes" 
                      :key="dish.id" 
                      @click="handleAdd(dish, 'dish')"
                      class="flex items-center gap-3 p-2 pr-3 rounded-2xl border transition-all cursor-pointer group"
                      :class="isContextMatch(dish) ? 'bg-indigo-50/30 border-indigo-100 hover:bg-indigo-50' : 'bg-white border-slate-50 hover:bg-slate-50'"
                   >
                       <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-xl bg-slate-100">
                            <img v-if="dish.image_url" :src="dish.image_url" class="w-full h-full object-cover">
                            <span v-else>🥘</span>
                       </div>
                       <div class="flex-1 min-w-0">
                           <div class="flex items-center gap-2">
                               <div class="font-bold text-slate-900 text-sm truncate">{{ dish.name }}</div>
                               <span v-if="isContextMatch(dish)" class="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">рек</span>
                           </div>
                           <div class="text-[10px] font-bold text-slate-400 mt-0.5 flex gap-2">
                               <span>{{ dish.kcal }} ккал</span>
                               <span class="text-slate-300">•</span>
                               <span>{{ dish.dish_type_name }}</span>
                           </div>
                       </div>
                       <div class="w-8 h-8 rounded-full flex items-center justify-center transition-colors" :class="isContextMatch(dish) ? 'bg-indigo-500 text-white shadow-md' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white'">
                           <span class="material-icons-round text-lg">add</span>
                       </div>
                   </div>
               </div>

               <div v-if="activeTab === 'products' && searchQuery" class="space-y-2">
                    <div v-for="prod in filteredProducts" :key="prod.id" @click="handleAdd(prod, 'product')" class="flex items-center gap-3 p-3 rounded-2xl border border-slate-50 hover:bg-slate-50 cursor-pointer">
                        <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg">🥦</div>
                        <div class="flex-1 font-bold text-slate-900 text-sm">{{ prod.name }}</div>
                        <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                           <span class="material-icons-round text-lg">add</span>
                       </div>
                    </div>
               </div>
          </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>