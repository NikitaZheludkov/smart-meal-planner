<script setup>
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'
import { useAppConfigStore } from '../stores/appConfig'
import ProductDetailModal from './ProductDetailModal.vue'
import CollapseTransition from './CollapseTransition.vue'
import { useVoiceDishInput } from '../composables/useVoiceDishInput'
import { toIdArray, formatUnit } from '../lib/utils'
import { getAutoTags } from '../lib/suggestions'

const appConfig = useAppConfigStore()

const props = defineProps({
  isOpen: Boolean,
  dish: Object 
})

const emit = defineEmits(['close'])
const dishStore = useDishStore()
const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const planStore = usePlanStore()
const platform = usePlatformStore()
const ui = useUIStore()

const isEditing = ref(false)
const isSaving = ref(false)

// Просмотр ↔ редактирование: шторка плавно меняет высоту от текущей к новой.
// Высоту фиксируем до перерисовки, меряем новую и анимируем между ними —
// иначе в момент смены разметки шторка на кадр схлопывается.
const sheetEl = ref(null)
let sheetResizeId = 0
watch(isEditing, async () => {
    const el = sheetEl.value
    if (!el || !props.isOpen) return
    const id = ++sheetResizeId
    const from = el.getBoundingClientRect().height
    el.style.height = `${from}px`
    await nextTick()
    // мерим новую высоту без перехода, иначе получим стартовое значение анимации
    el.style.transition = 'none'
    el.style.height = ''
    const to = el.getBoundingClientRect().height
    el.style.height = `${from}px`
    void el.offsetHeight
    el.style.transition = ''
    el.style.height = `${to}px`
    const clear = (e) => {
        if (e && (e.target !== el || e.propertyName !== 'height')) return
        if (id !== sheetResizeId) return // уже идёт следующая смена
        el.removeEventListener('transitionend', clear)
        el.style.height = ''
    }
    el.addEventListener('transitionend', clear)
    setTimeout(clear, 600)
}, { flush: 'pre' })
const showIngredientOverlay = ref(false)
const editingIngredientKey = ref(null)
const tempAmount = ref('')
const showCreateProductModal = ref(false)
const newProductTarget = ref(null)
const newProductIngredientKey = ref(null)
const showAdditionalDetails = ref(false)
const showProductDropdown = ref(false)
const lastSelectedProductId = ref(null)
let ingredientLocalKeySeed = 0
let productSearchBlurTimeout = null
const initialFormSnapshot = ref('')
const modalRegistryId = `dish-detail-${Math.random().toString(36).slice(2)}`

const formData = ref({
    id: null,
    name: '',
    dish_type: '',
    meal_type: [],
    description: '',
    kcal: null, protein: null, fat: null, carbs: null,
    is_batch: false,
    batch_yield: 1,
    needs_side_dish: false,
    cooking_method: '',
    tags: [],
    ingredients: []
})

const productSearchQuery = ref('')
const selectedProductsInOverlay = ref([])
const productAmounts = ref({})
const ingredientLinkIndex = ref(null)

const createIngredientLocalKey = () => `ing_${Date.now()}_${ingredientLocalKeySeed++}`

const normalizeIngredientRecord = (ingredient = {}) => ({
    localKey: ingredient.localKey || createIngredientLocalKey(),
    product: ingredient.product ?? null,
    name: formatIngredientName(ingredient.name || 'Неизвестно'),
    amount: Number.isFinite(Number(ingredient.amount)) ? Number(ingredient.amount) : 1,
    unit: ingredient.unit || 'Шт',
    needsAmountCheck: !!ingredient.needsAmountCheck,
    amountCheckReason: ingredient.amountCheckReason || null
})

const formatIngredientName = (value) => {
    const text = (value || '').toString().trim()
    if (!text) return 'Неизвестно'
    return text.charAt(0).toUpperCase() + text.slice(1)
}

const serializeFormDataForCompare = (data = {}) => JSON.stringify({
    id: data.id || null,
    name: data.name || '',
    dish_type: data.dish_type || '',
    meal_type: [...toIdArray(data.meal_type)].sort(),
    description: data.description || '',
    kcal: data.kcal ?? null,
    protein: data.protein ?? null,
    fat: data.fat ?? null,
    carbs: data.carbs ?? null,
    batch_yield: Number(data.batch_yield) || 1,
    needs_side_dish: !!data.needs_side_dish,
    cooking_method: data.cooking_method || '',
    tags: Array.isArray(data.tags) ? [...data.tags] : [],
    ingredients: Array.isArray(data.ingredients)
        ? data.ingredients.map((ing) => ({
            product: ing.product ?? null,
            name: formatIngredientName(ing.name),
            amount: Number.isFinite(Number(ing.amount)) ? Number(ing.amount) : 1,
            unit: ing.unit || 'Шт'
        }))
        : []
})

const hasUnsavedChanges = () => {
    if (!isEditing.value) return false
    return serializeFormDataForCompare(formData.value) !== initialFormSnapshot.value
}

const getAmountCheckLabel = (ingredient) => {
    switch (ingredient?.amountCheckReason) {
        case 'unit_mismatch':
            return 'Проверьте единицу'
        case 'unit_converted':
            return 'Проверьте количество'
        case 'amount_anomaly':
            return 'Проверьте количество'
        default:
            return 'Проверьте количество/единицу'
    }
}

const appendIngredients = (ingredientsToAdd = []) => {
    if (!ingredientsToAdd.length) return
    formData.value.ingredients = [
        ...formData.value.ingredients,
        ...ingredientsToAdd.map((ing) => normalizeIngredientRecord(ing))
    ]
}

// Запись голоса → Yandex SpeechKit → YandexGPT → поля/ингредиенты блюда.
// Реализация вынесена в composable (было ~300 строк аудио/AI-кода прямо
// внутри этой модалки), здесь только подключение к форме.
const {
    isRecordingVoice,
    isProcessingVoice,
    isAiNutritionEstimated,
    toggleVoiceRecord,
    dispose: disposeVoiceInput
} = useVoiceDishInput({
    isOpen: computed(() => props.isOpen),
    onDishFields: (patch) => Object.assign(formData.value, patch),
    onIngredients: (ings) => appendIngredients(ings),
    getProducts: async () => {
        if (productStore.products.length === 0) {
            await productStore.fetchProducts()
        }
        return productStore.products
    },
    showToast: (message, type) => ui.showToast(message, type)
})

const findIngredientIndexByKey = (localKey) => formData.value.ingredients.findIndex((ing) => ing.localKey === localKey)

const filteredProducts = computed(() => {
    const q = productSearchQuery.value.toLowerCase().trim()
    if (!q) return []
    
    return productStore.products
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 50)
})

watch(productSearchQuery, (newValue) => {
  if (newValue.length > 0) {
    showProductDropdown.value = true
  } else {
    showProductDropdown.value = false
  }
})

const handleBlur = () => {
    if (productSearchBlurTimeout) {
        window.clearTimeout(productSearchBlurTimeout)
    }
    productSearchBlurTimeout = window.setTimeout(() => {
        showProductDropdown.value = false
        productSearchBlurTimeout = null
    }, 200)
}

const isProductSelected = (productId) => {
    return selectedProductsInOverlay.value.some(p => p.id === productId)
}

const toggleProductSelection = (prod) => {
    platform.haptic.selection()
    if (isProductSelected(prod.id)) {
        selectedProductsInOverlay.value = selectedProductsInOverlay.value.filter(p => p.id !== prod.id)
        delete productAmounts.value[prod.id]
    } else {
        selectedProductsInOverlay.value.push(prod)
        productAmounts.value[prod.id] = ''
        lastSelectedProductId.value = prod.id
        productSearchQuery.value = ''
        showProductDropdown.value = false
        nextTick(() => {
            const input = document.querySelector(`[data-product-id="${prod.id}"]`)
            if (input) input.focus()
        })
    }
}

const removeSelectedProduct = (prod) => {
    platform.haptic.impact('light')
    selectedProductsInOverlay.value = selectedProductsInOverlay.value.filter(p => p.id !== prod.id)
    delete productAmounts.value[prod.id]
}

const focusNextProductInput = (currentProdId) => {
    const currentIndex = selectedProductsInOverlay.value.findIndex(p => p.id === currentProdId)
    const nextIndex = currentIndex + 1
    if (nextIndex < selectedProductsInOverlay.value.length) {
        const nextId = selectedProductsInOverlay.value[nextIndex].id
        nextTick(() => {
            const input = document.querySelector(`[data-product-id="${nextId}"]`)
            if (input) input.focus()
        })
    }
}

const confirmIngredients = () => {
    const newIngredients = []
    selectedProductsInOverlay.value.forEach(prod => {
        const amount = productAmounts.value[prod.id]
        if (amount) {
            newIngredients.push({
                product: prod.id,
                name: prod.name,
                unit: prod.unit,
                amount: parseFloat(amount)
            })
        }
    })
    appendIngredients(newIngredients)
    selectedProductsInOverlay.value = []
    productAmounts.value = {}
    productSearchQuery.value = ''
    showProductDropdown.value = false
    showIngredientOverlay.value = false
    ingredientLinkIndex.value = null
    platform.haptic.notification('success')
}

const closeIngredientOverlay = () => {
    selectedProductsInOverlay.value = []
    productAmounts.value = {}
    productSearchQuery.value = ''
    showProductDropdown.value = false
    showIngredientOverlay.value = false
    ingredientLinkIndex.value = null
}

const openIngredientSearch = (index) => {
    ingredientLinkIndex.value = index
    selectedProductsInOverlay.value = []
    productAmounts.value = {}
    productSearchQuery.value = formData.value.ingredients[index]?.name || ''
    showProductDropdown.value = true
    showIngredientOverlay.value = true
}

const linkIngredientToProduct = (prod) => {
    const idx = ingredientLinkIndex.value
    if (idx === null || idx === undefined) return
    const ing = formData.value.ingredients[idx]
    if (!ing) return
    ing.product = prod.id
    ing.unit = prod.unit || ing.unit
    ing.name = prod.name || ing.name
    ing.needsAmountCheck = false
    ing.amountCheckReason = null
    closeIngredientOverlay()
}

const removeIngredient = (index) => {
    if (editingIngredientKey.value === formData.value.ingredients[index]?.localKey) {
        editingIngredientKey.value = null
        tempAmount.value = ''
    }
    formData.value.ingredients.splice(index, 1)
    platform.haptic.impact('light')
}

const startEditingIngredient = (ingredient, amount) => {
    editingIngredientKey.value = ingredient.localKey
    tempAmount.value = amount
    platform.haptic.selection()
    
    nextTick(() => {
        const input = document.querySelector(`[data-ingredient-key="${ingredient.localKey}"]`)
        if (input) input.focus()
    })
}

const saveIngredientAmount = (localKey) => {
    const index = findIngredientIndexByKey(localKey)
    if (index === -1) {
        editingIngredientKey.value = null
        tempAmount.value = ''
        return
    }
    if (tempAmount.value) {
        formData.value.ingredients[index].amount = parseFloat(tempAmount.value)
    }
    editingIngredientKey.value = null
    tempAmount.value = ''
    platform.haptic.notification('success')
}

// Категория «Обед/Ужин» включает и выключает оба приёма сразу
const isMealTypeSelected = (group) => group.ids.some((id) => (formData.value.meal_type || []).includes(id))

const toggleMealType = (group) => {
    platform.haptic.selection()
    const current = formData.value.meal_type || []
    formData.value.meal_type = isMealTypeSelected(group)
        ? current.filter((id) => !group.ids.includes(id))
        : dictionaries.withMealPairs([...current, ...group.ids])
}

// Способ готовки — отметка, по которой потом точнее учитываем масло в КБЖУ.
// Выбирается один; повторное нажатие снимает выбор.
const COOKING_METHODS = [
    { id: 'raw', emoji: '🥗', label: 'Без готовки' },
    { id: 'boil', emoji: '🍲', label: 'Варить' },
    { id: 'bake', emoji: '🔥', label: 'Запекать' },
    { id: 'fry', emoji: '🍳', label: 'Жарить' }
]
const toggleCookingMethod = (id) => {
    platform.haptic.selection()
    formData.value.cooking_method = formData.value.cooking_method === id ? '' : id
}

const tagById = computed(() => new Map((dictionaries.availableTags || []).map((t) => [t.id, t])))

const isTagSelected = (tag) => {
    return formData.value.tags.includes(tag.id)
}

// «Много порций»: пока рецепт больше чем на 2 порции, тег стоит сам (то же
// правило на сервере). При 1–2 порциях его можно поставить вручную.
const manyPortionsTagId = computed(() => (dictionaries.availableTags || []).find((t) => t.name === 'Много порций')?.id || null)
const isTagLocked = (tag) => tag.id === manyPortionsTagId.value && (formData.value.batch_yield || 1) > 2
const syncManyPortionsTag = (oldValue, newValue) => {
    const id = manyPortionsTagId.value
    if (!id) return
    const tags = formData.value.tags || []
    if (newValue > 2 && !tags.includes(id)) formData.value.tags = [...tags, id]
    else if (newValue <= 2 && oldValue > 2) formData.value.tags = tags.filter((t) => t !== id)
}

const toggleTag = (tag) => {
    if (isTagLocked(tag)) return
    platform.haptic.selection()
    if (isTagSelected(tag)) {
        formData.value.tags = formData.value.tags.filter(tid => tid !== tag.id)
    } else {
        formData.value.tags.push(tag.id)
    }
}

// Признаки, которые считаются сами из КБЖУ (не теги в базе)
const autoTagNames = computed(() => getAutoTags(formData.value || {}).map((t) => t.name))

const initForm = (dishData) => {
    formData.value = JSON.parse(JSON.stringify(dishData))
    formData.value.meal_type = toIdArray(dishData.meal_type)
    formData.value.dish_type = dishData.dish_type || ''

    if (!formData.value.ingredients) formData.value.ingredients = []
    
    formData.value.ingredients = formData.value.ingredients.map(ing => {
        if (ing.productData && !ing.name) {
            return normalizeIngredientRecord({
                product: ing.product,
                name: ing.productData.name || 'Неизвестно',
                unit: ing.productData.unit || '',
                amount: ing.amount
            })
        }
        return normalizeIngredientRecord(ing)
    })

    if (!formData.value.tags) formData.value.tags = []
    
    formData.value.batch_yield = Number(formData.value.batch_yield) || 1
    formData.value.is_batch = formData.value.batch_yield > 1
    formData.value.needs_side_dish = !!formData.value.needs_side_dish
    formData.value.cooking_method = formData.value.cooking_method || ''
    
    if (!formData.value.id) {
        if (!formData.value.dish_type && dictionaries.dishTypes.length) {
            formData.value.dish_type = dictionaries.dishTypes[0].id
        }
        if (formData.value.meal_type.length === 0 && dictionaries.mealTypes.length) {
            formData.value.meal_type = dictionaries.withMealPairs([dictionaries.mealTypes[1]?.id || dictionaries.mealTypes[0]?.id])
        }
        isEditing.value = true
    } else {
        isEditing.value = false
    }
    
    selectedProductsInOverlay.value = []
    productAmounts.value = {}
    productSearchQuery.value = ''
    showProductDropdown.value = false
    showIngredientOverlay.value = false
    showAdditionalDetails.value = false
    isAiNutritionEstimated.value = false
    
    if (productStore.products.length === 0) {
        productStore.fetchProducts()
    }
    
    editingIngredientKey.value = null
    tempAmount.value = ''
    initialFormSnapshot.value = serializeFormDataForCompare(formData.value)
}

watch(() => props.isOpen, (newVal) => {
    ui.syncModalState(modalRegistryId, newVal)
    if (newVal) {
        isSaving.value = false
        if (props.dish) {
            initForm(props.dish)
        } else {
            initForm({
                id: null,
                name: '',
                dish_type: '',
                meal_type: [],
                description: '',
                kcal: null, protein: null, fat: null, carbs: null,
                is_batch: false,
                batch_yield: 1,
                tags: [],
                ingredients: []
            })
        }
    } else {
        // useVoiceDishInput сам игнорирует результат, как только props.isOpen
        // станет false (см. isStale() внутри composable) — отдельный счётчик
        // здесь больше не нужен.
        editingIngredientKey.value = null
        tempAmount.value = ''
        newProductIngredientKey.value = null
    }
})

watch(() => props.dish, (newVal) => {
  if (newVal && props.isOpen) {
    initForm(newVal)
  }
})

const handleSave = async () => {
  if (!formData.value.name || isSaving.value) return
  
  if (!formData.value.meal_type || formData.value.meal_type.length === 0) {
      ui.showToast('Выберите хотя бы один вид приёма пищи', 'warn')
      platform.haptic.notification('error')
      return
  }
  
  formData.value.is_batch = (formData.value.batch_yield || 1) > 1

  isSaving.value = true
  ui.addLog(`Попытка сохранения блюда: ${formData.value.name}`, 'info', formData.value)
  
  try {
    platform.haptic.notification('success')
    
    if (formData.value.id) {
      await dishStore.updateDish(formData.value.id, formData.value)
      ui.addLog('Блюдо успешно обновлено', 'info')
    } else {
      await dishStore.addDish(formData.value)
      ui.addLog('Блюдо успешно добавлено', 'info')
    }
    isEditing.value = false
    emit('close')
  } catch (e) {
    ui.addLog('Ошибка при сохранении блюда', 'error', {
      error: e.message,
      stack: e.stack,
      code: e.code
    })
    console.error('Save error:', e)
    platform.haptic.notification('error')
    ui.showToast(e.message || 'Не удалось сохранить блюдо. Проверьте соединение.', 'error')
  } finally {
    isSaving.value = false
  }
}

const handleDelete = async () => {
    platform.haptic.notification('warning')
    if (await ui.confirm('Удалить блюдо?', { okText: 'Удалить', cancelText: 'Отмена' })) {
        // Закрываем модалку до самого удаления: иначе вотчер в
        // DishesView/PlanView, следящий за исчезновением просматриваемого
        // блюда из списка (см. защиту от "зависшей" модалки при realtime-
        // удалении), успевает сработать первым и показать дублирующий тост.
        emit('close')
        await dishStore.deleteDish(formData.value.id)
        await planStore.fetchPlan()
    }
}

const handleCancel = async () => {
    platform.haptic.impact('light')

    if (hasUnsavedChanges()) {
        const confirmed = await ui.confirm('Изменения не сохранятся, выйти?', { okText: 'Выйти', cancelText: 'Остаться' })
        if (!confirmed) return
    }

    if (!formData.value.id) {
        emit('close')
        return
    }

    if (isEditing.value) {
        isEditing.value = false
        initForm(props.dish)
        return
    }

    emit('close')
}

const getDishTypeName = computed(() => {
    return dictionaries.getDishTypeById(formData.value.dish_type)?.name || '...'
})
const getMealTypeName = computed(() => {
    const names = dictionaries.dishMealTypeNames(toIdArray(formData.value.meal_type))
    return names.length ? names.join(' · ') : '...'
})

const openCreateProduct = (name = '') => {
    newProductTarget.value = name ? { name } : {}
    newProductIngredientKey.value = null
    showCreateProductModal.value = true
}

const onProductCreated = (product) => {
    showCreateProductModal.value = false
    if (newProductIngredientKey.value) {
        const index = findIngredientIndexByKey(newProductIngredientKey.value)
        if (index !== -1) {
            const ing = formData.value.ingredients[index]
            ing.product = product.id
            ing.name = product.name || ing.name
            ing.unit = product.unit || ing.unit
            ing.needsAmountCheck = false
            ing.amountCheckReason = null
        }
        newProductIngredientKey.value = null
        closeIngredientOverlay()
        return
    }
    toggleProductSelection(product)
}

// Создание продукта прямо из поиска ингредиентов: если это обычный подбор
// ингредиентов — новый продукт добавляется в выбранное (как обычный клик по
// найденному продукту); если это режим "Подобрать" для конкретного
// ингредиента (ingredientLinkIndex) — продукт сразу привязывается к нему.
const handleCreateProductFromSearch = () => {
    const name = productSearchQuery.value.trim()
    platform.haptic.impact('light')
    if (ingredientLinkIndex.value !== null) {
        const ing = formData.value.ingredients[ingredientLinkIndex.value]
        newProductTarget.value = { name }
        newProductIngredientKey.value = ing?.localKey || null
        showCreateProductModal.value = true
    } else {
        openCreateProduct(name)
    }
}

const createProductFromIngredient = (ing) => {
    newProductTarget.value = { name: ing.name }
    newProductIngredientKey.value = ing.localKey || null
    showCreateProductModal.value = true
}

const roundAmount = (n) => Math.round(n * 100) / 100

// Гарнирные блюда сами не нуждаются в гарнире — переключатель для них скрыт.
const isGarnishDish = computed(() => {
    const type = dictionaries.dishTypes.find((t) => t.id === formData.value.dish_type)
    return type?.name === 'Гарнир'
})

watch(() => formData.value.dish_type, () => {
    if (isGarnishDish.value) formData.value.needs_side_dish = false
})

// Количество ингредиентов всегда подразумевается "на formData.batch_yield
// порций" — эта функция единственная точка изменения этого числа (из обеих
// кнопок +/- и прямого ввода), чтобы при смене порций нельзя было случайно
// оставить старые количества молча означающими что-то другое. Если
// ингредиенты уже есть, явно спрашиваем, пересчитать ли их пропорционально
// — раньше это делалось молча, и человек мог не заметить, что "300 г риса",
// введённые на 1 порцию, стали означать 300 г на все 4 порции сразу.
const requestBatchYieldChange = async (rawValue) => {
    const oldValue = formData.value.batch_yield || 1
    const newValue = Math.max(1, Math.round(Number(rawValue)) || 1)
    if (newValue === oldValue) return

    if (formData.value.ingredients.length > 0) {
        const scale = newValue / oldValue
        const confirmed = await ui.confirm(
            `Порции: ${oldValue} → ${newValue}. Пересчитать количество ингредиентов пропорционально?`,
            { okText: 'Пересчитать', cancelText: 'Оставить как есть' }
        )
        if (confirmed) {
            formData.value.ingredients = formData.value.ingredients.map((ing) => ({
                ...ing,
                amount: roundAmount(ing.amount * scale)
            }))
        }
    }

    formData.value.batch_yield = newValue
    syncManyPortionsTag(oldValue, newValue)
    platform.haptic.selection()
}

onUnmounted(() => {
    if (productSearchBlurTimeout) {
        window.clearTimeout(productSearchBlurTimeout)
        productSearchBlurTimeout = null
    }
    disposeVoiceInput()
    ui.clearModalState(modalRegistryId)
})
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[70] flex flex-col justify-end" @click.self="handleCancel">
      <div class="absolute inset-0 bg-black/40 transition-opacity"></div>
      
      <div ref="sheetEl" class="sheet modal-content" :class="{ 'sheet-tall': isEditing }" style="isolation: isolate;">
            <div class="sheet-handle"></div>

            <div class="sheet-header z-20">
                <div>
                    <button @click="handleCancel" class="sheet-close tap-effect" aria-label="Закрыть">
                        <span class="material-icons-round text-xl">close</span>
                    </button>
                </div>

                <h3 class="sheet-title">
                    {{ formData.id ? (isEditing ? 'Редактирование' : 'Блюдо') : 'Новое блюдо' }}
                </h3>

                <div>
                    <button v-if="isEditing" @click="handleSave" :disabled="!formData.name || isSaving" class="sheet-action tap-effect">
                        <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                        {{ isSaving ? 'Сохр...' : 'Сохранить' }}
                    </button>
                    <button v-else @click="isEditing = true" class="sheet-close !text-slate-900 tap-effect" aria-label="Редактировать">
                        <span class="material-icons-round text-lg">edit</span>
                    </button>
                </div>
            </div>

            <div class="relative bg-white" :class="isEditing ? 'flex-1 overflow-hidden' : 'min-h-0 flex flex-col'">
                
                <div class="overflow-y-auto px-6 pt-4 no-scrollbar" :class="isEditing ? 'absolute inset-0 pb-[120px]' : 'min-h-0 pb-[calc(24px+env(safe-area-inset-bottom,0px))]'">
                    
                    <!-- новое содержимое проявляется, старое уходит сразу — так шторка
                         может сразу мерить и анимировать новую высоту -->
                    <div v-if="!isEditing" class="flex flex-col space-y-3 animate-fade-in">
                        <div class="text-center">
                            <h2 class="text-xl card-title leading-tight mb-1.5">{{ formData.name }}</h2>
                            <div class="text-xs text-secondary text-center">
                                {{ [getMealTypeName, getDishTypeName, ...(formData.tags || []).map((id) => tagById.get(id)?.name).filter(Boolean).map((n) => '#' + n)].filter(Boolean).join(' · ') }}
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-4 bg-slate-50 border border-slate-100 rounded-2xl py-1.5 divide-x divide-slate-200">
                            <div class="flex flex-col items-center leading-tight">
                                <span class="text-base font-black text-slate-900">{{ formData.kcal || 0 }}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Ккал</span>
                            </div>
                            <div class="flex flex-col items-center leading-tight">
                                <span class="text-base font-black text-slate-700">{{ formData.protein || 0 }}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Белки</span>
                            </div>
                            <div class="flex flex-col items-center leading-tight">
                                <span class="text-base font-black text-slate-700">{{ formData.fat || 0 }}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Жиры</span>
                            </div>
                            <div class="flex flex-col items-center leading-tight">
                                <span class="text-base font-black text-slate-700">{{ formData.carbs || 0 }}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Угле</span>
                            </div>
                        </div>
                        <div v-if="isAiNutritionEstimated" class="flex justify-center -mt-1">
                            <span class="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                Оценка AI
                            </span>
                        </div>

                        <div v-if="formData.ingredients?.length" class="w-full">
                            <h4 class="card-title text-sm mb-1.5 ml-1 flex items-center justify-between">
                                <span>Состав</span>
                                <span
                                    class="text-[10px] font-black px-2 py-0.5 rounded-full"
                                    :class="(formData.batch_yield || 1) > 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'"
                                >
                                    на {{ formData.batch_yield || 1 }} порц.
                                </span>
                            </h4>
                            <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                <div v-for="(ing, idx) in formData.ingredients" :key="ing.localKey" class="flex justify-between items-center gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 text-sm" :class="ing.product === null ? 'bg-yellow-50' : ''">
                                    <div class="flex items-center gap-2 min-w-0 flex-1">
                                        <div class="min-w-0">
                                            <span class="card-title text-sm whitespace-normal break-words block leading-snug">{{ ing.name }}</span>
                                            <div v-if="ing.product !== null && ing.needsAmountCheck" class="mt-0.5 text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-200 inline-flex">
                                                {{ getAmountCheckLabel(ing) }}
                                            </div>
                                        </div>
                                        <button v-if="ing.product === null" @click="createProductFromIngredient(ing)" class="shrink-0 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-lg border border-yellow-200 hover:bg-yellow-200 transition-colors">
                                            Создать
                                        </button>
                                    </div>
                                    <span class="shrink-0 text-xs font-normal px-2 py-0.5 rounded-md" :class="ing.needsAmountCheck ? 'text-orange-700 bg-orange-100 border border-orange-200' : 'text-secondary bg-slate-100'">{{ ing.amount }} {{ formatUnit(ing.unit) }}</span>
                                </div>
                            </div>
                        </div>

                        <div v-if="formData.description" class="w-full">
                            <h4 class="card-title text-sm mb-1.5 ml-1">Приготовление</h4>
                            <div class="bg-slate-50 px-3.5 py-3 rounded-2xl text-black text-sm leading-relaxed whitespace-pre-wrap border border-slate-100">
                                {{ formData.description }}
                            </div>
                        </div>
                    </div>

                    <div v-else class="relative overflow-hidden min-h-[400px] animate-fade-in">
                        
                        <div class="space-y-4">
                            
                            <div class="space-y-2">
                                <div class="flex items-center gap-2">
                                    <input 
                                        v-model="formData.name" 
                                        placeholder="Название блюда"
                                        class="flex-1 text-center text-lg font-bold input-outline rounded-2xl px-4 py-2.5 w-full outline-none focus:ring-0 transition-colors placeholder:text-slate-300 placeholder:font-medium"
                                    >
                                    <button 
                                        v-if="appConfig.voiceInputEnabled && isProcessingVoice"
                                        class="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0"
                                        disabled
                                    >
                                        <span class="material-icons-round text-xl text-slate-400 animate-spin">sync</span>
                                    </button>
                                    <button 
                                        v-else-if="appConfig.voiceInputEnabled"
                                        @click="toggleVoiceRecord"
                                        class="w-11 h-11 rounded-2xl flex items-center justify-center transition-all tap-effect shrink-0"
                                        :class="isRecordingVoice 
                                            ? 'bg-red-500 animate-pulse text-white' 
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                                    >
                                        <span v-if="isRecordingVoice" class="material-icons-round text-xl">stop</span>
                                        <span v-else class="material-icons-round text-xl">mic</span>
                                    </button>
                                </div>
                                <div v-if="isRecordingVoice" class="text-center text-xs font-bold text-red-500">
                                    Слушаю...
                                </div>
                                <div v-else-if="appConfig.voiceInputEnabled && !formData.id && !formData.ingredients.length" class="text-center text-[10px] font-bold text-slate-400 px-4">
                                    Можно надиктовать рецепт целиком — название, состав и БЖУ заполнятся сами
                                </div>
                            </div>

                            <div class="bg-white rounded-2xl p-2.5 border border-slate-200 shadow-sm space-y-2">
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Вид блюда</div>
                                    <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
                                        <button
                                            v-for="t in dictionaries.dishTypes"
                                            :key="t.id"
                                            @click="formData.dish_type = t.id"
                                            type="button"
                                            class="chip tap-effect"
                                            :class="formData.dish_type === t.id ? 'chip-active' : ''"
                                        >
                                            {{ t.name }}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Вид приёма пищи <span class="font-normal">— можно выбрать несколько</span></div>
                                    <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
                                         <button
                                            v-for="t in dictionaries.dishMealTypes"
                                            :key="t.id"
                                            @click="toggleMealType(t)"
                                            type="button"
                                            class="chip tap-effect"
                                            :class="isMealTypeSelected(t) ? 'chip-active' : ''"
                                        >
                                            {{ t.name }}
                                        </button>
                                    </div>
                                </div>

                                <div v-if="dictionaries.availableTags.length">
                                    <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Теги <span class="font-normal">— помогают в подсказках при планировании</span></div>
                                    <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
                                        <button
                                            v-for="tag in dictionaries.availableTags"
                                            :key="tag.id"
                                            @click="toggleTag(tag)"
                                            type="button"
                                            class="chip tap-effect"
                                            :class="[isTagSelected(tag) ? 'chip-active' : '', isTagLocked(tag) ? 'opacity-70' : '']"
                                            :aria-disabled="isTagLocked(tag)"
                                        >
                                            {{ tag.name }}
                                        </button>
                                    </div>
                                    <div v-if="manyPortionsTagId && (formData.batch_yield || 1) > 2" class="text-[10px] text-secondary mt-1.5 pl-1">«Много порций» стоит сам: рецепт больше чем на 2 порции</div>
                                    <div v-if="autoTagNames.length" class="text-[10px] text-secondary mt-1.5 pl-1">
                                        Автоматически по КБЖУ: {{ autoTagNames.join(' · ') }}
                                    </div>
                                </div>
                            </div>

                            <div v-if="!isGarnishDish" class="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900">
                                            <span class="material-icons-round text-xl">rice_bowl</span>
                                        </div>
                                        <div>
                                            <div class="text-sm font-black text-slate-900">Подаётся с гарниром</div>
                                            <div class="text-[10px] font-bold text-slate-400">При выборе в план предложим сразу добавить гарнир</div>
                                        </div>
                                    </div>
                                    <button
                                        @click="formData.needs_side_dish = !formData.needs_side_dish; platform.haptic.selection()"
                                        class="w-11 h-6 rounded-full relative shrink-0 transition-colors"
                                        :class="formData.needs_side_dish ? 'bg-slate-900' : 'bg-slate-200'"
                                    >
                                        <span
                                            class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                                            :class="formData.needs_side_dish ? 'translate-x-5' : 'translate-x-0'"
                                        ></span>
                                    </button>
                                </div>
                            </div>

                            <!-- Способ готовки: отметка для точного учёта масла в КБЖУ -->
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 mb-1 pl-1">Как готовим <span class="font-normal">— для точного учёта масла в КБЖУ</span></div>
                                <!-- Ширина по тексту, свободное место делится поровну: «Без готовки» длиннее остальных -->
                                <div class="flex gap-[3px]">
                                    <button
                                        v-for="m in COOKING_METHODS"
                                        :key="m.id"
                                        type="button"
                                        @click="toggleCookingMethod(m.id)"
                                        class="chip tap-effect flex-auto !px-1 !gap-0.5 justify-center !text-[10.5px]"
                                        :class="formData.cooking_method === m.id ? 'chip-active' : ''"
                                        :aria-pressed="formData.cooking_method === m.id"
                                    >
                                        <!-- На узких экранах эмодзи прячем, чтобы все четыре подписи влезли в строку -->
                                        <span class="text-[12px] leading-none max-[374px]:hidden">{{ m.emoji }}</span>{{ m.label }}
                                    </button>
                                </div>
                            </div>

                            <div class="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900">
                                            <span class="material-icons-round text-xl">restaurant</span>
                                        </div>
                                        <div>
                                            <div class="text-sm font-black text-slate-900">Сколько порций даёт рецепт?</div>
                                            <div class="text-[10px] font-bold text-slate-400">Ингредиенты ниже указывайте на это количество</div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <button
                                            @click="requestBatchYieldChange((formData.batch_yield || 1) - 1)"
                                            class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-transform"
                                        >
                                            <span class="material-icons-round text-base">remove</span>
                                        </button>
                                        <input
                                            :value="formData.batch_yield || 1"
                                            @change="requestBatchYieldChange($event.target.value)"
                                            type="number"
                                            inputmode="numeric"
                                            min="1"
                                            class="w-10 h-8 !p-0 bg-transparent text-slate-900 font-black text-center outline-none border-none text-lg"
                                            @focus="$event.target.select()"
                                        >
                                        <button
                                            @click="requestBatchYieldChange((formData.batch_yield || 1) + 1)"
                                            class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-transform"
                                        >
                                            <span class="material-icons-round text-base">add</span>
                                        </button>
                                    </div>
                                </div>

                                <div v-if="(formData.batch_yield || 1) > 1" class="mt-3 pt-3 border-t border-slate-100">
                                    <p class="text-[10px] text-slate-400 leading-snug">
                                        Мы будем учитывать, сколько порций осталось при планировании питания, и предупредим, когда они закончатся — если вы готовите еду впрок.
                                    </p>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <h4 class="card-title text-sm ml-1 flex items-center justify-between">
                                    <span>Состав</span>
                                    <span
                                        class="text-[11px] font-black px-2.5 py-1 rounded-full"
                                        :class="(formData.batch_yield || 1) > 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'"
                                    >
                                        на {{ formData.batch_yield || 1 }} порц.
                                    </span>
                                </h4>
                                <div v-if="formData.ingredients.length > 0" class="bg-slate-50 rounded-2xl p-1.5 space-y-1">
                                    <div v-for="(ing, idx) in formData.ingredients" :key="ing.localKey" class="p-1.5 bg-white rounded-xl border shadow-sm" :class="ing.product === null ? 'border-yellow-400 bg-yellow-50' : (ing.needsAmountCheck ? 'border-orange-300 bg-white' : 'border-slate-100')">
                                        <div class="flex items-center gap-2">
                                            <div class="w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0"></div>
                                            <div class="flex-1 min-w-0 font-bold text-slate-700 text-[13px] truncate">{{ ing.name }}</div>

                                            <div class="flex items-center gap-1 shrink-0">
                                                <input
                                                    v-show="editingIngredientKey === ing.localKey"
                                                    v-model="tempAmount"
                                                    :data-ingredient-key="ing.localKey"
                                                    type="number"
                                                    inputmode="decimal"
                                                    class="ing-edit-input w-14 px-1.5 py-0.5 rounded-lg font-bold text-center outline-none border text-sm"
                                                    :class="ing.needsAmountCheck ? 'bg-orange-50 border-orange-300 text-orange-700 focus:border-orange-500' : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-slate-400'"
                                                    @keydown.enter="saveIngredientAmount(ing.localKey)"
                                                    @blur="saveIngredientAmount(ing.localKey)"
                                                >
                                                <span v-show="editingIngredientKey === ing.localKey" class="text-[9px] font-bold" :class="ing.needsAmountCheck ? 'text-orange-500' : 'text-slate-400'">{{ formatUnit(ing.unit) }}</span>
                                                <button
                                                    v-show="editingIngredientKey !== ing.localKey"
                                                    @click="startEditingIngredient(ing, ing.amount)"
                                                    class="font-bold text-[11px] px-1.5 py-0.5 rounded-lg border transition-colors whitespace-nowrap"
                                                    :class="ing.needsAmountCheck ? 'text-orange-700 bg-orange-100 border-orange-200 hover:bg-orange-200' : 'text-slate-500 bg-slate-50 border-slate-100 hover:bg-slate-100'"
                                                >
                                                    {{ ing.amount }} {{ formatUnit(ing.unit) }}
                                                </button>
                                            </div>

                                            <button @click="removeIngredient(idx)" class="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-lg hover:bg-red-50 shrink-0">
                                                <span class="material-icons-round text-sm">close</span>
                                            </button>
                                        </div>

                                        <div v-if="ing.product === null || ing.needsAmountCheck" class="mt-1.5 pl-3.5 flex flex-wrap items-center gap-1.5">
                                            <div v-show="ing.product !== null && ing.needsAmountCheck" class="text-[9px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-md border border-orange-200 inline-flex">
                                                {{ getAmountCheckLabel(ing) }}
                                            </div>

                                            <button v-show="ing.product === null" @click="createProductFromIngredient(ing)" class="text-[9px] font-bold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-lg border border-yellow-200 hover:bg-yellow-200 transition-colors whitespace-nowrap">
                                                Создать в базе
                                            </button>

                                            <button v-show="ing.product === null || ing.needsAmountCheck" @click="openIngredientSearch(idx)" class="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors whitespace-nowrap">
                                                Подобрать
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div v-else class="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                    Ингредиентов нет
                                </div>
                            </div>

                            <button 
                                @click="showIngredientOverlay = true"
                                class="w-full py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 tap-effect active:bg-slate-800 transition-colors shadow-lg"
                            >
                                <span class="material-icons-round text-lg">add</span>
                                Ингредиент
                            </button>

                            <div class="border-t border-slate-100 pt-2">
                                <button
                                    @click="showAdditionalDetails = !showAdditionalDetails"
                                    class="w-full py-3 rounded-2xl bg-slate-50 text-slate-700 font-bold text-sm flex items-center justify-center gap-2 tap-effect active:bg-slate-100 transition-colors"
                                >
                                    <span class="material-icons-round text-lg transition-transform" :class="showAdditionalDetails ? 'rotate-180' : ''">expand_more</span>
                                    БЖУ и заметки
                                </button>
                            </div>

                            <CollapseTransition>
                                <div v-if="showAdditionalDetails" class="space-y-4 pt-2">
                                    
                                    <div class="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
                                        <div class="mb-2 flex items-center justify-between">
                                            <span class="text-[10px] font-bold text-slate-400">На 1 порцию, не на весь объём</span>
                                            <span v-if="isAiNutritionEstimated" class="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                                                Оценка AI
                                            </span>
                                        </div>
                                        <div class="flex gap-2">
                                            <div class="flex-1">
                                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Ккал</div>
                                                <input v-model.number="formData.kcal" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-900 font-black rounded-xl text-center outline-none border border-slate-100 text-base focus:border-slate-300">
                                            </div>
                                            <div class="flex-1">
                                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Белки</div>
                                                <input v-model.number="formData.protein" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                                            </div>
                                            <div class="flex-1">
                                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Жиры</div>
                                                <input v-model.number="formData.fat" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                                            </div>
                                            <div class="flex-1">
                                                <div class="text-[10px] font-bold text-slate-400 text-center mb-1">Угл</div>
                                                <input v-model.number="formData.carbs" type="number" placeholder="0" class="w-full py-2 px-1 bg-slate-50 text-slate-700 font-bold rounded-xl text-center outline-none border border-slate-200 text-base focus:border-slate-300">
                                            </div>
                                        </div>
                                    </div>

                                    <textarea 
                                        v-model="formData.description" 
                                        placeholder="Заметки / Рецепт" 
                                        class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-0 border-none min-h-[120px] text-base leading-relaxed"
                                    ></textarea>

                                </div>
                            </CollapseTransition>

                            <div v-if="formData.id" class="pt-4">
                                <button @click="handleDelete" class="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 tap-effect active:bg-slate-200 transition-colors">
                                    <span class="material-icons-round text-sm">delete_outline</span>
                                    Удалить блюдо
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>

            <Transition name="modal">
            <div v-show="showIngredientOverlay" class="fixed inset-0 z-[80] flex flex-col">
                <div class="absolute inset-0 bg-black/50" @click="closeIngredientOverlay"></div>
                <div class="sheet sheet-tall modal-content relative z-10 mt-auto">
                    <div class="sheet-handle"></div>
                    <div class="sheet-header">
                        <button @click="closeIngredientOverlay" class="sheet-close tap-effect" aria-label="Закрыть">
                            <span class="material-icons-round text-xl">close</span>
                        </button>
                        <h3 class="sheet-title">{{ ingredientLinkIndex === null ? 'Продукты' : 'Выбор продукта' }}</h3>
                        <div>
                            <button
                                v-if="ingredientLinkIndex === null"
                                @click="confirmIngredients"
                                :disabled="selectedProductsInOverlay.length === 0"
                                class="sheet-action tap-effect"
                            >
                                Готово{{ selectedProductsInOverlay.length ? ` (${selectedProductsInOverlay.length})` : '' }}
                            </button>
                        </div>
                    </div>
                    
                    <div class="px-5 py-3">
                        <div class="relative z-[90]">
                            <div class="bg-white rounded-2xl border border-slate-200 focus-within:border-slate-400 transition-colors flex items-center pl-3 shadow-sm">
                                <span class="material-icons-round text-slate-300 text-xl">search</span>
                                <input 
                                    v-model="productSearchQuery" 
                                    @blur="handleBlur"
                                    placeholder="Поиск продуктов..." 
                                    class="w-full p-3.5 bg-transparent font-bold text-slate-700 outline-none border-none text-base placeholder:text-slate-300"
                                >
                            </div>
                            
                            <div v-show="showProductDropdown && filteredProducts.length > 0" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-[40vh] z-[100]">
                                <button 
                                    v-for="prod in filteredProducts" 
                                    :key="prod.id"
                                    @click.stop="ingredientLinkIndex !== null ? linkIngredientToProduct(prod) : toggleProductSelection(prod)"
                                    class="w-full text-left px-4 py-4 hover:bg-slate-50 font-bold text-slate-700 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center group"
                                    :class="isProductSelected(prod.id) ? 'bg-slate-100' : ''"
                                >
                                    <span class="group-hover:text-slate-900 transition-colors">{{ prod.name }}</span>
                                    <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{{ formatUnit(prod.unit) }}</span>
                                </button>
                                <button
                                    type="button"
                                    @click.stop="handleCreateProductFromSearch"
                                    class="w-full text-left px-4 py-4 bg-slate-50 font-bold text-slate-900 text-sm flex items-center gap-2 tap-effect rounded-none"
                                >
                                    <span class="material-icons-round text-lg">add_circle</span>
                                    <span class="truncate">Создать новый «{{ productSearchQuery.trim() }}»</span>
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            @click="handleCreateProductFromSearch"
                            class="w-full mt-2 py-2.5 px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 tap-effect active:scale-[0.98] transition-transform"
                        >
                            <span class="material-icons-round text-base shrink-0">add_circle_outline</span>
                            <span class="truncate">{{ productSearchQuery.trim() ? `Нет в списке? Создать «${productSearchQuery.trim()}»` : 'Нет нужного продукта? Создать новый' }}</span>
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto px-5 pt-3 pb-32">
                        <div v-if="selectedProductsInOverlay.length > 0" class="space-y-1">
                            <div class="text-[10px] font-bold text-slate-400 mb-2">Выбрано ({{ selectedProductsInOverlay.length }}):</div>
                            <div 
                                v-for="prod in selectedProductsInOverlay" 
                                :key="prod.id"
                                class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200"
                            >
                                <div class="flex-1 card-title truncate">{{ prod.name }}</div>
                                <div class="flex items-center gap-2">
                                    <input 
                                        :data-product-id="prod.id"
                                        v-model.number="productAmounts[prod.id]"
                                        type="number"
                                        inputmode="decimal"
                                        class="w-20 p-2 bg-slate-100 rounded-xl font-bold text-center text-sm outline-none"
                                        @keydown.enter="focusNextProductInput(prod.id)"
                                    >
                                    <span class="text-sm font-bold text-slate-400">{{ formatUnit(prod.unit) }}</span>
                                </div>
                                <button @click.stop="removeSelectedProduct(prod)" class="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500">
                                    <span class="material-icons-round text-sm">close</span>
                                </button>
                            </div>
                        </div>
                        <div v-else-if="productSearchQuery.trim() && filteredProducts.length === 0" class="text-center py-12">
                            <span class="material-icons-round text-4xl text-slate-200 mb-2">search_off</span>
                            <div class="text-slate-400 text-sm mb-4">Продукт «{{ productSearchQuery.trim() }}» не найден</div>
                            <button
                                @click="handleCreateProductFromSearch"
                                class="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 tap-effect"
                            >
                                <span class="material-icons-round text-sm">add</span>
                                Создать «{{ productSearchQuery.trim() }}»
                            </button>
                        </div>
                        <div v-else class="text-center py-12 text-slate-400 text-sm">
                            <span class="material-icons-round text-4xl text-slate-200 mb-2">search</span>
                            <div>Начните вводить название продукта</div>
                        </div>
                    </div>
                </div>
            </div>
            </Transition>
      </div>
      <ProductDetailModal 
          :is-open="showCreateProductModal"
          :product="newProductTarget"
          :z-index="100"
          @saved="onProductCreated"
          @close="showCreateProductModal = false"
      />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>
