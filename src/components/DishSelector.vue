<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { usePlanStore } from '../stores/plan'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { buildContext, rankDishes, SUGGESTION_FILTERS } from '../lib/suggestions'
import { format, parseISO } from 'date-fns'
import CollapseTransition from './CollapseTransition.vue'
import { ru } from 'date-fns/locale'

const props = defineProps({
  isOpen: Boolean,
  selectedDate: [Date, String],
  slotId: String, 
  existingItems: {     
      type: Array,
      default: () => []
  },
  yesterdayItems: {
      type: Array,
      default: () => []
  },
  // Начало текущего периода плана — для подсказок "из того, что покупаем"
  periodStart: [Date, String]
})

const emit = defineEmits(['close', 'select'])

const dishStore = useDishStore()
const productStore = useProductStore()
const planStore = usePlanStore()
const dictionaries = useDictionariesStore()
const platform = usePlatformStore()
const ui = useUIStore()

const activeMode = ref('dish') 
const transitionName = ref('slide-left')
const modes = ['dish', 'product']
const searchQuery = ref('')
const activeCategory = ref('all')
const showSearchDropdown = ref(false)
const modalRegistryId = `dish-selector-${Math.random().toString(36).slice(2)}`

watch(activeMode, (newVal, oldVal) => {
  const oldIndex = modes.indexOf(oldVal)
  const newIndex = modes.indexOf(newVal)
  transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right'
})

onMounted(async () => {
    if (dishStore.dishes.length === 0) await dishStore.fetchDishes()
    if (productStore.products.length === 0) await productStore.fetchProducts()
})

watch(() => props.isOpen, (newVal) => {
    ui.syncModalState(modalRegistryId, newVal)
}, { immediate: true })

// Окно не размонтируется при закрытии (иначе не видно анимации ухода),
// поэтому при каждом открытии начинаем с чистого листа.
watch(() => props.isOpen, (open) => {
    if (!open) return
    transitionName.value = 'slide-left'
    activeMode.value = 'dish'
    searchQuery.value = ''
    activeCategory.value = 'all'
    showSearchDropdown.value = false
    suggestionFilters.value = []
    suggestionPage.value = 0
    garnishPrompt.value = null
})

onUnmounted(() => {
    ui.clearModalState(modalRegistryId)
})

watch(searchQuery, (newValue) => {
    showSearchDropdown.value = newValue.length > 0
})

const selectFromDropdown = (dish) => {
    selectItem(dish, 'dish')
    searchQuery.value = ''
    showSearchDropdown.value = false
}

// --- Предложения (движок в lib/suggestions.js) ---
const settingsStore = useSettingsStore()
const SUGGESTIONS_PER_PAGE = 3
const SUGGESTIONS_OPEN_KEY = 'dishSelector.suggestionsOpen'
const readSuggestionsOpen = () => {
    try { return localStorage.getItem(SUGGESTIONS_OPEN_KEY) === '1' } catch (_) { return false }
}
const suggestionsOpen = ref(readSuggestionsOpen())
const toggleSuggestions = () => {
    platform.haptic.selection()
    suggestionsOpen.value = !suggestionsOpen.value
    try { localStorage.setItem(SUGGESTIONS_OPEN_KEY, suggestionsOpen.value ? '1' : '0') } catch (_) {}
}
const suggestionFilters = ref([])
const suggestionPage = ref(0)

// Фильтры: вычисляемые + теги пользователя
const suggestionFilterOptions = computed(() => [
    ...SUGGESTION_FILTERS,
    ...(dictionaries.availableTags || []).map((t) => ({ id: t.id, name: t.name }))
])

const toggleSuggestionFilter = (id) => {
    platform.haptic.selection()
    const idx = suggestionFilters.value.indexOf(id)
    if (idx === -1) suggestionFilters.value.push(id)
    else suggestionFilters.value.splice(idx, 1)
    suggestionPage.value = 0
}

const rankedSuggestions = computed(() => {
    if (activeMode.value !== 'dish' || searchQuery.value || !props.selectedDate || !props.slotId) return []
    const ctx = buildContext({
        planItems: planStore.plan,
        dishes: dishStore.dishes,
        periodStart: props.periodStart || props.selectedDate,
        periodLength: settingsStore.periodLength || 7
    })
    const onlyGarnish = !!garnishTypeId.value && activeCategory.value === garnishTypeId.value
    let ranked = rankDishes(ctx, dishStore.dishes, {
        date: props.selectedDate,
        mealTypeId: props.slotId,
        mealTypeName: dictionaries.getMealTypeById(props.slotId)?.name || '',
        filters: suggestionFilters.value,
        excludeDishIds: props.existingItems.map((i) => i.dish).filter(Boolean),
        garnishTypeId: garnishTypeId.value,
        onlyGarnish
    })
    if (!onlyGarnish && activeCategory.value !== 'all') {
        ranked = ranked.filter((r) => r.dish.dish_type === activeCategory.value)
    }
    return ranked
})

const suggestionPageCount = computed(() => Math.ceil(rankedSuggestions.value.length / SUGGESTIONS_PER_PAGE))
const visibleSuggestions = computed(() => {
    const start = (suggestionPage.value % Math.max(1, suggestionPageCount.value)) * SUGGESTIONS_PER_PAGE
    return rankedSuggestions.value.slice(start, start + SUGGESTIONS_PER_PAGE)
})
const showMoreSuggestions = () => {
    platform.haptic.selection()
    suggestionPage.value = (suggestionPage.value + 1) % Math.max(1, suggestionPageCount.value)
}
watch([activeCategory, () => props.existingItems.length], () => { suggestionPage.value = 0 })

// Видимые предложения не дублируем в общем списке ниже
const recommendedDishes = computed(() => suggestionsOpen.value ? visibleSuggestions.value.map((r) => r.dish) : [])

// Подпись свёрнутого блока: первый вариант и сколько ещё
const suggestionsPreview = computed(() => {
    const list = rankedSuggestions.value
    if (!list.length) return suggestionFilters.value.length ? 'нет блюд под фильтры' : 'нет подходящих блюд'
    const first = list[0].dish.name
    return list.length > 1 ? `${first} и ещё ${list.length - 1}` : first
})

const dropdownSearchResults = computed(() => {
    if (!searchQuery.value) return []
    
    const q = searchQuery.value.toLowerCase().trim()
    let list = dishStore.dishes

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.dish).filter(Boolean))
        list = list.filter(d => !selectedIds.has(d.id))
    }

    const found = list.filter(d => d.name.toLowerCase().includes(q))
    return [...found.filter(isForSlot), ...found.filter((d) => !isForSlot(d))]
})

const filteredDishes = computed(() => {
    let list = dishStore.dishes

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.dish).filter(Boolean))
        list = list.filter(d => !selectedIds.has(d.id))
    }

    // Если нет поиска, убираем рекомендации из общего списка
    if (!searchQuery.value) {
        const recIds = new Set(recommendedDishes.value.map(d => d.id))
        list = list.filter(d => !recIds.has(d.id))
    }

    if (activeCategory.value !== 'all') {
        list = list.filter(d => d.dish_type === activeCategory.value)
    }

    return list
})

// Общий список делим: сначала блюда того приёма пищи, который заполняем
// (нажали «Завтрак» — сверху завтраки), затем все остальные
const isForSlot = (dish) => (dish.meal_type || []).includes(props.slotId)
const slotDishes = computed(() => filteredDishes.value.filter(isForSlot))
const otherDishes = computed(() => filteredDishes.value.filter((d) => !isForSlot(d)))
const dishSections = computed(() => [
    { id: 'slot', title: getSlotName.value, dishes: slotDishes.value },
    { id: 'other', title: slotDishes.value.length || recommendedDishes.value.length ? 'Другие блюда' : 'Все блюда', dishes: otherDishes.value }
].filter((section) => section.dishes.length))

const groupedProducts = computed(() => {
    let list = productStore.products

    if (props.existingItems.length > 0) {
        const selectedIds = new Set(props.existingItems.map(i => i.product).filter(Boolean))
        list = list.filter(p => !selectedIds.has(p.id))
    }
    
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(p => p.name.toLowerCase().includes(q))
    }

    const groups = {}
    list.forEach(p => {
        const cat = p.category || 'Разное'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(p)
    })
    
    return groups
})

// Если у только что выбранного блюда стоит "Подаётся с гарниром" и в этом
// приёме пищи гарнира ещё нет — подсказываем добавить его, не заставляя
// искать нужную категорию вручную. Баннер сам исчезает, как только гарнир
// в слоте появляется (следим через watch ниже), в т.ч. если добавили его
// без подсказки.
const garnishTypeId = computed(() => dictionaries.dishTypes.find((t) => t.name === 'Гарнир')?.id || null)

const hasGarnishInSlot = computed(() => {
    if (!garnishTypeId.value) return false
    return props.existingItems.some((i) => {
        if (!i.dish) return false
        const dish = dishStore.dishes.find((d) => d.id === i.dish)
        return dish?.dish_type === garnishTypeId.value
    })
})

const garnishPrompt = ref(null) // { dishName } | null

watch(() => props.existingItems, () => {
    if (hasGarnishInSlot.value) garnishPrompt.value = null
}, { deep: true })

const selectItem = (item, type) => {
    platform.haptic.selection()
    emit('select', { item, type })

    if (type === 'dish' && item.needs_side_dish && garnishTypeId.value && !hasGarnishInSlot.value) {
        garnishPrompt.value = { dishName: item.name }
    }
}

const pickGarnish = () => {
    platform.haptic.selection()
    activeMode.value = 'dish'
    activeCategory.value = garnishTypeId.value
    searchQuery.value = ''
    garnishPrompt.value = null
}

const dismissGarnishPrompt = () => {
    garnishPrompt.value = null
}

const updatePortions = (item, delta) => {
    platform.haptic.selection()
    const newPortions = Math.max(1, (item.portions || 1) + delta)
    planStore.updatePlanItem(item.id, { portions: newPortions })
}

const toggleShopping = (item) => {
    platform.haptic.impact('medium')
    planStore.updatePlanItem(item.id, { 
        ignore_shopping: !item.ignore_shopping 
    })
}

const removeItem = (item) => {
    platform.haptic.notification('warning')
    planStore.removeFromPlan(item.id)
}

const getSlotName = computed(() => {
    const slot = dictionaries.mealTypes.find(m => m.id === props.slotId)
    return slot ? slot.name : 'Прием пищи'
})

const isSlotMatch = (dishMealTypeId) => dishMealTypeId === props.slotId
const getDishSlotName = (id) => {
    const slot = dictionaries.mealTypes.find(m => m.id === id)
    return slot ? slot.name : ''
}
</script>

<template>
  <Transition name="modal">
  <div v-if="isOpen" class="fixed inset-0 z-[70] flex flex-col justify-end" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-black/40 transition-opacity"></div>
    
    <div class="sheet sheet-tall modal-content">
      
      <div class="flex-1 flex flex-col overflow-hidden relative">
        <div class="sheet-handle"></div>

        <!-- Sticky Header Section -->
        <div class="shrink-0 bg-white z-30 border-b border-slate-100">
            <!-- Шапка: крестик слева, приём пищи и дата по центру. Изменения применяются сразу. -->
            <div class="sheet-header !border-b-0 mb-1">
                <button @click="$emit('close')" class="sheet-close tap-effect" aria-label="Закрыть">
                    <span class="material-icons-round text-xl">close</span>
                </button>
                <div class="min-w-0">
                    <h2 class="sheet-title">{{ getSlotName }}</h2>
                    <p class="sheet-subtitle">{{ selectedDate ? format(new Date(selectedDate), 'd MMMM, EEEE', { locale: ru }) : '' }}</p>
                </div>
                <button @click="$emit('close')" class="sheet-action tap-effect">Готово</button>
            </div>

            <!-- Search Row -->
            <div class="px-4 pb-3">
                <div class="relative group">
                    <span class="material-icons-round absolute left-3 top-2.5 text-slate-300 text-lg transition-colors group-focus-within:text-slate-900">search</span>
                    <input 
                        v-model="searchQuery" 
                        :placeholder="activeMode === 'dish' ? 'Поиск рецептов...' : 'Поиск продуктов...'" 
                        class="w-full pl-10 pr-10 py-2.5 bg-slate-50 rounded-2xl font-bold text-sm outline-none border-none placeholder:text-slate-300 focus:bg-slate-100 transition-colors"
                        @blur="setTimeout(() => showSearchDropdown = false, 200)"
                        @focus="searchQuery.length > 0 && (showSearchDropdown = true)"
                    >
                    <button 
                        v-if="searchQuery" 
                        @click="searchQuery = ''; platform.haptic.selection()"
                        class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 tap-effect"
                    >
                        <span class="material-icons-round text-lg">close</span>
                    </button>
                    
                    <!-- Dropdown -->
                    <div v-if="showSearchDropdown && activeMode === 'dish' && dropdownSearchResults.length > 0" 
                         class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-60 z-50">
                        <button 
                            v-for="dish in dropdownSearchResults" 
                            :key="dish.id"
                            @mousedown="selectFromDropdown(dish)"
                            class="w-full text-left px-4 py-3 hover:bg-slate-50 card-title border-b border-slate-50 last:border-0 flex justify-between items-center group"
                        >
                            <span>{{ dish.name }}</span>
                            <span v-if="dish.kcal" class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">🔥 {{ dish.kcal }}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Existing Items: порции и "уже есть дома" можно поправить сразу тут -->
            <CollapseTransition>
            <div v-if="existingItems.length > 0" class="px-4 pb-3">
                <div class="bg-slate-50/80 rounded-2xl p-2 border border-slate-100">
                    <div class="text-[10px] font-black text-slate-400 px-1 mb-1.5 uppercase tracking-wider">
                        <span>Выбрано ({{ existingItems.length }})</span>
                    </div>
                    <CollapseTransition group class="space-y-1.5">
                        <div v-for="item in existingItems" :key="item._key || item.id"
                            class="bg-white border border-slate-200 rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-sm"
                        >
                            <span class="flex-1 min-w-0 text-[11px] font-bold text-slate-700 truncate">
                                {{ item.dish ? item.dishData?.name : item.productData?.name }}
                            </span>

                            <div class="flex items-center gap-0.5 bg-slate-50 rounded-lg shrink-0">
                                <button @click="updatePortions(item, -1)" class="w-6 h-6 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
                                    <span class="material-icons-round text-sm">remove</span>
                                </button>
                                <span class="w-4 text-center text-[11px] font-black text-slate-900">{{ item.portions || 1 }}</span>
                                <button @click="updatePortions(item, 1)" class="w-6 h-6 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
                                    <span class="material-icons-round text-sm">add</span>
                                </button>
                            </div>

                            <button
                                @click="toggleShopping(item)"
                                :title="item.ignore_shopping ? 'Не войдёт в список покупок — уже есть дома' : 'Войдёт в список покупок'"
                                class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                                :class="item.ignore_shopping ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 'bg-slate-50 text-slate-300'"
                            >
                                <span class="material-icons-round text-sm">{{ item.ignore_shopping ? 'remove_shopping_cart' : 'shopping_cart' }}</span>
                            </button>

                            <button @click="removeItem(item)" class="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                <span class="material-icons-round text-lg">cancel</span>
                            </button>
                        </div>
                    </CollapseTransition>
                </div>
            </div>
            </CollapseTransition>

            <!-- Подсказка "добавить гарнир" — появляется после выбора блюда с
                 отмеченным needs_side_dish, пока в слоте нет ни одного гарнира -->
            <CollapseTransition>
                <div v-if="garnishPrompt" class="px-4 pb-3">
                    <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center gap-3">
                        <span class="text-xl shrink-0">🍚</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-[11px] font-bold text-indigo-900 leading-snug">
                                «{{ garnishPrompt.dishName }}» подаётся с гарниром
                            </div>
                        </div>
                        <button @click="pickGarnish" class="shrink-0 btn-primary text-[11px] py-2 px-3 whitespace-nowrap">
                            Выбрать гарнир
                        </button>
                        <button @click="dismissGarnishPrompt" class="shrink-0 text-indigo-300 hover:text-indigo-500">
                            <span class="material-icons-round text-lg">close</span>
                        </button>
                    </div>
                </div>
            </CollapseTransition>

            <!-- Mode Switcher -->
            <div class="px-4 pb-3 flex gap-2">
                <div class="flex-1 bg-slate-100 p-1 rounded-xl flex font-bold text-[10px]">
                    <button 
                        @click="activeMode = 'dish'; platform.haptic.selection()" 
                        class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
                        :class="activeMode === 'dish' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                    >
                        <span>🥘</span> Рецепты
                    </button>
                    <button 
                        @click="activeMode = 'product'; platform.haptic.selection()" 
                        class="flex-1 py-1.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
                        :class="activeMode === 'product' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'"
                    >
                        <span>🥦</span> Продукты
                    </button>
                </div>
            </div>
        </div>

        <!-- Filter Row (Horizontal Scroll) -->
        <div v-if="activeMode === 'dish'" class="shrink-0 bg-white px-4 py-2 border-b border-slate-50 flex overflow-x-auto gap-1.5 no-scrollbar">
            <button 
                @click="activeCategory = 'all'; platform.haptic.selection()" 
                class="chip tap-effect"
                :class="activeCategory === 'all' ? 'chip-active' : ''"
            >
                Все
            </button>
            <button 
                v-for="cat in dictionaries.dishTypes" 
                :key="cat.id" 
                @click="activeCategory = cat.id; platform.haptic.selection()"
                class="chip tap-effect"
                :class="activeCategory === cat.id ? 'chip-active' : ''"
            >
                {{ cat.name }}
            </button>
        </div>

        <div class="flex-1 relative overflow-hidden bg-slate-50">
            <Transition :name="transitionName">
            <div v-if="activeMode === 'dish'" key="dish" class="absolute inset-0 w-full h-full overflow-y-auto px-4 pb-10 pt-3">
                <div v-if="searchQuery && filteredDishes.length === 0" class="empty-state-container">
                    <div class="empty-state-icon">
                        <span class="material-icons-round" style="font-size: 64px;">{{ searchQuery ? 'search_off' : 'restaurant_menu' }}</span>
                    </div>
                    <p class="empty-state-title">{{ searchQuery ? 'Ничего не найдено' : 'Список пуст' }}</p>
                </div>

                <!-- Предложения -->
                <div v-if="!searchQuery" class="mb-4">
                    <div class="bg-white rounded-2xl border border-slate-100 flex items-center">
                        <button
                            @click="toggleSuggestions"
                            class="flex-1 min-w-0 !rounded-2xl flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 text-left"
                            :aria-expanded="suggestionsOpen"
                        >
                            <span class="material-icons-round text-lg text-slate-900 shrink-0">auto_awesome</span>
                            <span class="flex-1 min-w-0">
                                <span class="block card-title leading-tight">Предложения</span>
                                <span v-if="!suggestionsOpen" class="block text-[11px] text-secondary truncate mt-0.5">{{ suggestionsPreview }}</span>
                            </span>
                            <span class="material-icons-round text-xl text-slate-400 shrink-0 transition-transform duration-300" :class="suggestionsOpen ? 'rotate-180' : ''">expand_more</span>
                        </button>
                        <button
                            v-if="suggestionsOpen && suggestionPageCount > 1"
                            @click="showMoreSuggestions"
                            class="text-[11px] font-semibold text-slate-500 flex items-center gap-1 tap-effect pr-3.5 pl-1 shrink-0"
                        >
                            <span class="material-icons-round text-sm">refresh</span>
                            Ещё варианты
                        </button>
                    </div>

                    <CollapseTransition>
                    <div v-if="suggestionsOpen" class="pt-2">
                    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 mb-2">
                        <button
                            v-for="f in suggestionFilterOptions"
                            :key="f.id"
                            @click="toggleSuggestionFilter(f.id)"
                            class="chip tap-effect"
                            :class="suggestionFilters.includes(f.id) ? 'chip-active' : ''"
                        >{{ f.name }}</button>
                    </div>

                    <Transition name="swap" mode="out-in">
                    <div v-if="visibleSuggestions.length" :key="visibleSuggestions.map((s) => s.dish.id).join()" class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                        <button
                            v-for="s in visibleSuggestions"
                            :key="s.dish.id"
                            @click="selectItem(s.dish, 'dish')"
                            class="w-full !rounded-none flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50 last:border-0 text-left active:bg-slate-50 transition-colors"
                        >
                            <div class="flex-1 min-w-0">
                                <div class="card-title leading-snug flex items-center gap-1">
                                    <span v-if="s.dish.batch_yield > 1" title="Готовится про запас" class="material-icons-round text-xs text-slate-400 shrink-0">kitchen</span>
                                    {{ s.dish.name }}
                                </div>
                                <div v-for="reason in s.reasons" :key="reason" class="text-[11px] text-secondary leading-snug mt-0.5">{{ reason }}</div>
                                <div v-if="s.dish.kcal" class="text-[11px] text-secondary leading-snug mt-0.5">{{ s.dish.kcal }} ккал на порцию</div>
                            </div>
                            <span class="w-8 h-8 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                                <span class="material-icons-round text-lg">add</span>
                            </span>
                        </button>
                    </div>
                    <div v-else class="text-[12px] text-secondary text-center bg-white rounded-2xl border border-slate-100 px-4 py-4">
                        {{ suggestionFilters.length ? 'Нет блюд под выбранные фильтры' : 'Нет блюд для этого приёма пищи' }}
                    </div>
                    </Transition>
                    </div>
                    </CollapseTransition>
                </div>

                <!-- Основной список -->
                <div v-for="section in dishSections" :key="section.id" class="space-y-2 mb-4">
                    <div class="flex items-center gap-2 px-1">
                        <span class="app-eyebrow">{{ section.title }}</span>
                        <div class="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <TransitionGroup name="list" tag="div" class="space-y-2 relative">
                    <div 
                        v-for="dish in section.dishes" 
                        :key="dish.id"
                        @click="selectItem(dish, 'dish')"
                        class="p-2.5 rounded-2xl flex items-center gap-3 border bg-white border-slate-100 shadow-sm transition-colors tap-effect active:scale-[0.98]"
                    >
                        <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center text-xl border border-slate-100/50 relative">
                            <img v-if="dish.image_url" :src="dish.image_url" class="w-full h-full object-cover">
                            <span v-else>🥘</span>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="card-title text-sm truncate mb-0.5 flex items-center gap-1">
                                <span v-if="dish.batch_yield > 1" title="Готовится про запас" class="material-icons-round text-xs text-indigo-500 shrink-0">kitchen</span>
                                {{ dish.name }}
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-medium text-secondary bg-slate-100 px-1.5 py-0.5 rounded">{{ dictionaries.getDishTypeById(dish.dish_type)?.name || '...' }}</span>
                                <span class="text-[10px] font-bold text-orange-400">🔥 {{ dish.kcal }}</span>
                            </div>
                        </div>

                        <button class="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 flex items-center justify-center shadow-sm">
                            <span class="material-icons-round text-lg">add</span>
                        </button>
                    </div>
                    </TransitionGroup>
                </div>
            </div>

            <div v-else key="product" class="absolute inset-0 w-full h-full overflow-y-auto px-4 pb-10 pt-3">
                <div v-for="(products, catName) in groupedProducts" :key="catName">
                    <h3 class="text-[10px] font-black text-slate-400 mb-2 ml-1 uppercase tracking-wider">{{ catName }}</h3>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div 
                            v-for="prod in products" 
                            :key="prod.id"
                            @click="selectItem(prod, 'product')"
                            class="flex items-center justify-between p-3 border-b border-slate-50 last:border-0 active:bg-slate-50 transition-colors"
                        >
                            <div class="flex items-center gap-3">
                                <div class="text-xl">🥦</div>
                                <span class="card-title text-sm">{{ prod.name }}</span>
                            </div>
                            <button class="w-7 h-7 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center">
                                <span class="material-icons-round text-sm">add</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            </Transition>
        </div>
      </div>
    </div>
  </div>
  </Transition>
</template>

