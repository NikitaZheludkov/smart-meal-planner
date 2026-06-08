<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { useDishStore } from '../stores/dishes'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlanStore } from '../stores/plan'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'
import ProductDetailModal from './ProductDetailModal.vue'

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
const showTagSelection = ref(false)
const showIngredientOverlay = ref(false)
const editingIngredientIndex = ref(null)
const tempAmount = ref('')
const showCreateProductModal = ref(false)
const newProductTarget = ref(null)
const showAdditionalDetails = ref(false)
const showProductDropdown = ref(false)
const lastSelectedProductId = ref(null)
const isRecordingVoice = ref(false)
const isProcessingVoice = ref(false)
const voiceText = ref('')
let audioRecorder = null
let audioChunks = []
let mediaStream = null
let productSearchBlurTimeout = null

const formData = ref({
    id: null,
    name: '',
    dish_type: '',
    meal_type: '',
    description: '',
    kcal: null, protein: null, fat: null, carbs: null,
    is_batch: false,
    batch_yield: 1,
    tags: [],
    ingredients: []
})

const productSearchQuery = ref('')
const selectedProductsInOverlay = ref([])
const productAmounts = ref({})
const ingredientLinkIndex = ref(null)

const unitMap = { "г": "Кг", "грамм": "Кг", "гр": "Кг", "кг": "Кг", "л": "Л", "мл": "Л", "шт": "Шт", "упак": "Упак" }

const normalizeUnit = (unitString) => {
    if (!unitString) return unitString
    const key = unitString.toString().toLowerCase().trim()
    return unitMap[key] || unitString
}

const normalizeName = (value) => (value || '').toString().toLowerCase().trim()

const findMatch = (aiName, productsBase) => {
    const q = normalizeName(aiName)
    if (!q) return null
    for (const p of (productsBase || [])) {
        const pn = normalizeName(p?.name)
        if (!pn) continue
        if (pn.includes(q) || q.includes(pn)) return p
    }
    return null
}

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
    selectedProductsInOverlay.value.forEach(prod => {
        const amount = productAmounts.value[prod.id]
        if (amount) {
            formData.value.ingredients.push({
                product: prod.id,
                name: prod.name,
                unit: prod.unit,
                amount: parseFloat(amount)
            })
        }
    })
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
    closeIngredientOverlay()
}

const removeIngredient = (index) => {
    formData.value.ingredients.splice(index, 1)
    platform.haptic.impact('light')
}

const startEditingIngredient = (index, amount) => {
    editingIngredientIndex.value = index
    tempAmount.value = amount
    platform.haptic.selection()
    
    nextTick(() => {
        const input = document.querySelector('.ing-edit-input')
        if (input) input.focus()
    })
}

const saveIngredientAmount = (index) => {
    if (tempAmount.value) {
        formData.value.ingredients[index].amount = parseFloat(tempAmount.value)
    }
    editingIngredientIndex.value = null
    tempAmount.value = ''
    platform.haptic.notification('success')
}

const selectMealType = (id) => {
    platform.haptic.selection()
    formData.value.meal_type = id
}

const categoryLabels = {
    'time': 'Время приготовления',
    'context': 'Сценарий и Метод',
    'diet': 'Тип питания и Здоровье',
    'other': 'Прочее'
}

const groupedTags = computed(() => {
    const groups = {}
    dictionaries.availableTags.forEach(tag => {
        const cat = tag.category || 'other'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(tag)
    })
    
    const order = ['time', 'context', 'diet']
    
    return order.map(code => ({
        code,
        label: categoryLabels[code] || code,
        tags: groups[code] || []
    })).filter(g => g.tags.length > 0)
})

const tagById = computed(() => new Map((dictionaries.availableTags || []).map((t) => [t.id, t])))

const isTagSelected = (tag) => {
    return formData.value.tags.includes(tag.id)
}

const toggleTag = (tag) => {
    platform.haptic.selection()
    if (isTagSelected(tag)) {
        formData.value.tags = formData.value.tags.filter(tid => tid !== tag.id)
    } else {
        formData.value.tags.push(tag.id)
    }
}

const openTagSelector = () => {
    platform.haptic.impact('light')
    showTagSelection.value = true
}

const closeTagSelector = () => {
    platform.haptic.impact('light')
    showTagSelection.value = false
}

const initForm = (dishData) => {
    formData.value = JSON.parse(JSON.stringify(dishData))
    formData.value.meal_type = dishData.meal_type || ''
    formData.value.dish_type = dishData.dish_type || ''

    if (!formData.value.ingredients) formData.value.ingredients = []
    
    formData.value.ingredients = formData.value.ingredients.map(ing => {
        if (ing.productData && !ing.name) {
            return {
                product: ing.product,
                name: ing.productData.name || 'Неизвестно',
                unit: ing.productData.unit || '',
                amount: ing.amount
            }
        }
        return ing
    })

    if (!formData.value.tags) formData.value.tags = []
    
    formData.value.batch_yield = Number(formData.value.batch_yield) || 1
    formData.value.is_batch = formData.value.batch_yield > 1
    
    if (!formData.value.id) {
        if (!formData.value.dish_type && dictionaries.dishTypes.length) {
            formData.value.dish_type = dictionaries.dishTypes[0].id
        }
        if (!formData.value.meal_type && dictionaries.mealTypes.length) {
            formData.value.meal_type = dictionaries.mealTypes[1]?.id || dictionaries.mealTypes[0]?.id
        }
        isEditing.value = true
    } else {
        isEditing.value = false
    }
    
    selectedProductsInOverlay.value = []
    productAmounts.value = {}
    productSearchQuery.value = ''
    showProductDropdown.value = false
    showTagSelection.value = false 
    showIngredientOverlay.value = false
    showAdditionalDetails.value = false
    
    if (productStore.products.length === 0) {
        productStore.fetchProducts()
    }
    
    editingIngredientIndex.value = null
    tempAmount.value = ''
}

watch(() => props.isOpen, (newVal) => {
    ui.isModalOpen = newVal
    if (newVal) {
        isSaving.value = false
        if (props.dish) {
            initForm(props.dish)
        } else {
            initForm({
                id: null,
                name: '',
                dish_type: '',
                meal_type: '',
                description: '',
                kcal: null, protein: null, fat: null, carbs: null,
                is_batch: false,
                batch_yield: 1,
                tags: [],
                ingredients: []
            })
        }
    }
})

watch(() => props.dish, (newVal) => {
  if (newVal && props.isOpen) {
    initForm(newVal)
  }
})

const handleSave = async () => {
  if (!formData.value.name || isSaving.value) return
  
  if (!formData.value.meal_type) {
      ui.showToast('Выберите прием пищи', 'warn')
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
        await dishStore.deleteDish(formData.value.id)
        await planStore.fetchPlan()
        emit('close')
    }
}

const handleCancel = () => {
    platform.haptic.impact('light')
    
    if (!formData.value.id) {
        emit('close')
        return
    }

    if (isEditing.value) {
        isEditing.value = false
        formData.value = JSON.parse(JSON.stringify(props.dish))
        return
    }

    emit('close')
}

const getDishTypeName = computed(() => {
    return dictionaries.getDishTypeById(formData.value.dish_type)?.name || '...'
})
const getMealTypeName = computed(() => {
    return dictionaries.getMealTypeById(formData.value.meal_type)?.name || '...'
})

const openCreateProduct = () => {
    newProductTarget.value = {}
    showCreateProductModal.value = true
}

const onProductCreated = (product) => {
    showCreateProductModal.value = false
    toggleProductSelection(product)
}

const audioBufferTo16BitPCM = (audioBuffer) => {
    const numberOfChannels = Math.max(1, audioBuffer.numberOfChannels || 1)
    const length = audioBuffer.length || 0
    const result = new ArrayBuffer(length * 2)
    const view = new DataView(result)

    for (let i = 0; i < length; i++) {
        let sample = 0
        for (let ch = 0; ch < numberOfChannels; ch++) {
            sample += audioBuffer.getChannelData(ch)[i] || 0
        }
        sample /= numberOfChannels
        sample = Math.max(-1, Math.min(1, sample))
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    }

    return result
}

const resampleAudioBuffer = async (audioBuffer, targetSampleRate) => {
    const targetRate = Number(targetSampleRate) || 16000
    if (!audioBuffer || !audioBuffer.sampleRate || audioBuffer.sampleRate === targetRate) return audioBuffer

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
    if (!OfflineCtx) {
        throw new Error('OfflineAudioContext не поддерживается в этом браузере')
    }

    const length = Math.ceil(audioBuffer.duration * targetRate)
    const offlineContext = new OfflineCtx(1, length, targetRate)
    const source = offlineContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(offlineContext.destination)
    source.start(0)
    return await offlineContext.startRendering()
}

const toggleVoiceRecord = async () => {
    if (isRecordingVoice.value) {
        if (audioRecorder && audioRecorder.state !== 'inactive') {
            audioRecorder.stop()
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop())
        }
        isRecordingVoice.value = false
        return
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioChunks = []
        
        const preferredMimeTypes = [
            'audio/ogg; codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/webm; codecs=opus',
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/wav'
        ]
        const selectedMimeType = preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
        audioRecorder = selectedMimeType ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType }) : new MediaRecorder(mediaStream)

        audioRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data)
            }
        }

        audioRecorder.onstop = () => {
            const blobType = audioRecorder.mimeType || audioChunks?.[0]?.type || selectedMimeType || 'application/octet-stream'
            const audioBlob = new Blob(audioChunks, { type: blobType })
            console.log('Audio recorded:', audioBlob.size, 'bytes', blobType)
            processAudioWithAI(audioBlob)
            
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop())
            }
        }

        audioRecorder.onerror = (event) => {
            console.error('Audio recording error:', event.error)
            isRecordingVoice.value = false
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop())
            }
        }

        audioRecorder.start()
        isRecordingVoice.value = true
        voiceText.value = ''

    } catch (error) {
        console.error('Failed to access microphone:', error)
        ui.showToast('Не удалось получить доступ к микрофону', 'error')
    }
}

const processAudioWithAI = async (audioBlob) => {
    isProcessingVoice.value = true
    
    try {
        const yandexFolderId = import.meta.env.VITE_YANDEX_FOLDER_ID

        if (!yandexFolderId) {
            throw new Error('Не задан VITE_YANDEX_FOLDER_ID')
        }

        let recognizedText = ''

        try {
            let audioBuffer = null
            let lpcmData = null

            try {
                const audioArrayBuffer = await audioBlob.arrayBuffer()
                const AudioCtx = window.AudioContext || window.webkitAudioContext
                if (!AudioCtx) {
                    throw new Error('AudioContext не поддерживается в этом браузере')
                }
                const audioContext = new AudioCtx()
                try {
                    audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer.slice(0))
                } finally {
                    await audioContext.close().catch(() => {})
                }
                audioBuffer = await resampleAudioBuffer(audioBuffer, 16000)
                if (audioBuffer.sampleRate !== 16000) {
                    throw new Error(`Не удалось привести sampleRate к 16000Hz (получилось ${audioBuffer.sampleRate})`)
                }
                lpcmData = audioBufferTo16BitPCM(audioBuffer)
            } catch (e) {
                console.error('Ошибка декодирования/конвертации аудио в LPCM:', e)
                throw e
            }

            const sttUrl = new URL('/api/yandex-stt/speech/v1/stt:recognize', window.location.origin)
            sttUrl.searchParams.set('folderId', yandexFolderId)
            sttUrl.searchParams.set('lang', 'ru-RU')
            sttUrl.searchParams.set('topic', 'general')
            sttUrl.searchParams.set('format', 'lpcm')
            sttUrl.searchParams.set('sampleRateHertz', '16000')

            const sttResponse = await fetch(sttUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: lpcmData
            })

            const sttRaw = await sttResponse.text()

            if (!sttResponse.ok) {
                console.error('Yandex SpeechKit STT error:', sttResponse.status, sttRaw)
                throw new Error(`Yandex SpeechKit STT error: ${sttResponse.status}`)
            }

            let sttJson = null
            try {
                sttJson = JSON.parse(sttRaw)
            } catch (e) {
                sttJson = null
            }

            recognizedText = (sttJson?.result || '').toString().trim()

            if (!recognizedText) {
                console.error('Yandex SpeechKit STT empty result:', sttRaw)
                throw new Error('Yandex SpeechKit STT вернул пустой результат')
            }

            console.log('SpeechKit recognized text:', recognizedText)
        } catch (e) {
            console.error('SpeechKit STT request failed:', e)
            throw e
        }

        let yandexGptText = ''

        try {
            const gptResponse = await fetch('/api/yandex-llm/foundationModels/v1/completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    modelUri: `gpt://${yandexFolderId}/yandexgpt/latest`,
                    completionOptions: {
                        stream: false,
                        temperature: 0.2,
                        maxTokens: 2000
                    },
                    messages: [
                        {
                            role: 'system',
                            text: "Верни ответ строго в формате JSON: {'title': 'Название', 'ingredients': [{'name': 'продукт', 'amount': число, 'unit': 'строка'}]}. Никакого лишнего текста."
                        },
                        {
                            role: 'user',
                            text: recognizedText
                        }
                    ]
                })
            })

            const gptRaw = await gptResponse.text()

            if (!gptResponse.ok) {
                console.error('YandexGPT error:', gptResponse.status, gptRaw)
                throw new Error(`YandexGPT error: ${gptResponse.status}`)
            }

            let gptJson = null
            try {
                gptJson = JSON.parse(gptRaw)
            } catch (e) {
                gptJson = null
            }

            yandexGptText = (
                gptJson?.result?.alternatives?.[0]?.message?.text ||
                gptJson?.result?.alternatives?.[0]?.text ||
                gptJson?.alternatives?.[0]?.text ||
                ''
            ).toString().trim()

            if (!yandexGptText) {
                console.error('YandexGPT empty text:', gptRaw)
                throw new Error('YandexGPT вернул пустой ответ')
            }
        } catch (e) {
            console.error('YandexGPT request failed:', e)
            throw e
        }

        const cleaned = yandexGptText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()

        let parsed = null
        try {
            parsed = JSON.parse(cleaned)
        } catch (e) {
            console.error('Не удалось распарсить JSON от YandexGPT:', cleaned)
            throw e
        }
        
        if (parsed.title) {
            formData.value.name = parsed.title
        }
        
        if (parsed.description) {
            formData.value.description = parsed.description
        }
        
        if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
            if (productStore.products.length === 0) {
                await productStore.fetchProducts()
            }
            parsed.ingredients.forEach(ing => {
                const aiName = (typeof ing === 'string' ? ing : (ing?.name || ing?.product || 'Неизвестно'))
                const match = findMatch(aiName, productStore.products)
                const amount = (typeof ing === 'object' && ing !== null && ing.amount !== undefined && ing.amount !== null)
                    ? (parseFloat(ing.amount) || 1)
                    : 1
                const aiUnit = (typeof ing === 'object' && ing !== null) ? normalizeUnit(ing.unit) : undefined
                formData.value.ingredients.push({
                    product: match?.id || null,
                    name: match?.name || aiName,
                    amount,
                    unit: aiUnit || match?.unit || 'Шт'
                })
            })
        }
        
    } catch (error) {
        console.error('Ошибка обработки аудио (Yandex):', error)
        ui.showToast('Не удалось обработать аудио', 'error')
    } finally {
        isProcessingVoice.value = false
    }
}

const createProductFromIngredient = (ing) => {
    newProductTarget.value = { name: ing.name }
    showCreateProductModal.value = true
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex flex-col justify-end" @click.self="$emit('close')">
      <div class="absolute inset-0 bg-black/40 transition-opacity"></div>
      
      <div class="relative w-full h-[92vh] max-h-[92vh] bg-white rounded-t-3xl overflow-hidden flex flex-col shadow-2xl modal-content" style="isolation: isolate;">
            <div class="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2 shrink-0"></div>

            <div class="px-5 pt-2 pb-3 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white z-20 min-h-[50px]">
            
                <div class="w-20 flex justify-start">
                    <button 
                        v-if="showTagSelection" 
                        @click="closeTagSelector" 
                        class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 tap-effect active:scale-95 transition-transform"
                    >
                        <span class="material-icons-outlined text-xl">arrow_back</span>
                    </button>

                    <button 
                        v-else 
                        @click="handleCancel" 
                        class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
                    >
                        <span class="material-icons-round text-xl">close</span>
                    </button>
                </div>
                
                <div class="flex-1 flex flex-col items-center justify-center px-2">
                    <h3 v-if="!isEditing || showTagSelection" class="text-lg font-bold text-slate-900 truncate text-center leading-tight">
                        {{ showTagSelection ? 'Свойства' : (formData.id ? 'Просмотр' : 'Новое блюдо') }}
                    </h3>
                </div>

                <div class="w-20 flex justify-end items-center gap-2">
                    <button v-if="showTagSelection" @click="closeTagSelector" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 shadow-lg tap-effect">Готово</button>
                    
                    <template v-else>
                        <button 
                            v-if="!isEditing" 
                            @click="isEditing = true" 
                            class="w-10 h-10 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
                        >
                            <span class="material-icons-round text-xl">edit</span>
                        </button>
                    </template>
                </div>
            </div>

            <div class="flex-1 overflow-hidden relative bg-white">
                
                <transition name="slide-fade">
                
                <div v-if="!showTagSelection" class="absolute inset-0 overflow-y-auto px-6 pb-[120px] pt-4 no-scrollbar">
                    
                    <div v-if="!isEditing" class="flex flex-col space-y-6">
                        <div class="text-center">
                            <h2 class="text-2xl card-title leading-tight mb-2">{{ formData.name }}</h2>
                            <div class="flex flex-wrap justify-center gap-1.5">
                                <span class="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold">
                                    {{ getMealTypeName }}
                                </span>
                                <span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200">
                                    {{ getDishTypeName }}
                                </span>
                                <span v-for="tagId in formData.tags" :key="tagId" class="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                     {{ tagById.get(tagId)?.icon }} {{ tagById.get(tagId)?.name }}
                                </span>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-4 gap-2">
                            <div class="bg-slate-100 p-2 rounded-2xl border border-slate-200 flex flex-col items-center">
                                <span class="text-lg font-black text-slate-900">{{ formData.kcal || 0 }}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Ккал</span>
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
                            <h4 class="card-title text-sm mb-3 ml-1">
                                Состав <span v-if="(formData.batch_yield || 1) > 1" class="text-[9px] font-normal text-secondary opacity-70">(На {{ formData.batch_yield }} порц.)</span>
                            </h4>
                            <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 text-sm" :class="ing.product === null ? 'bg-yellow-50' : ''">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span class="card-title text-sm truncate flex-1 min-w-0">{{ ing.name }}</span>
                                        <button v-if="ing.product === null" @click="createProductFromIngredient(ing)" class="shrink-0 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-lg border border-yellow-200 hover:bg-yellow-200 transition-colors">
                                            Создать
                                        </button>
                                    </div>
                                    <span class="shrink-0 font-normal text-secondary bg-slate-50 px-2 py-0.5 rounded-md">{{ ing.amount }} {{ ing.unit }}</span>
                                </div>
                            </div>
                        </div>

                        <div v-if="formData.description" class="w-full">
                            <h4 class="card-title text-sm mb-3 ml-1">Приготовление</h4>
                            <div class="bg-slate-50 p-4 rounded-2xl text-black text-sm leading-relaxed whitespace-pre-wrap border border-slate-100">
                                {{ formData.description }}
                            </div>
                        </div>

                        <div class="pt-2">
                            <button 
                                v-if="!isEditing"
                                @click="isEditing = true" 
                                class="btn-primary w-full shadow-lg text-sm flex items-center justify-center gap-2 mb-3"
                            >
                                <span class="material-icons-round text-lg">edit</span>
                                Редактировать
                            </button>
                            
                            <button 
                                v-if="!isEditing"
                                @click="$emit('close')" 
                                class="btn-secondary w-full text-sm font-bold"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>

                    <div v-else class="relative overflow-hidden min-h-[400px]">
                        
                        <div class="space-y-4">
                            
                            <div class="space-y-2">
                                <div class="flex items-center gap-2">
                                    <input 
                                        v-model="formData.name" 
                                        placeholder="Название блюда"
                                        class="flex-1 text-center text-xl font-bold bg-slate-50 border-none rounded-2xl px-4 py-3 w-full focus:ring-0 placeholder:text-slate-300"
                                        autofocus
                                    >
                                    <button 
                                        v-if="isProcessingVoice"
                                        class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"
                                        disabled
                                    >
                                        <span class="material-icons-round text-xl text-slate-400 animate-spin">sync</span>
                                    </button>
                                    <button 
                                        v-else
                                        @click="toggleVoiceRecord"
                                        class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all tap-effect"
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
                            </div>

                            <div class="space-y-3">
                                <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                    <button 
                                        v-for="t in dictionaries.dishTypes" 
                                        :key="t.id" 
                                        @click="formData.dish_type = t.id"
                                        type="button"
                                        class="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors border tap-effect flex items-center gap-1.5"
                                        :class="formData.dish_type === t.id ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
                                    >
                                        {{ t.name }}
                                        <div v-if="formData.dish_type === t.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                                    </button>
                                </div>

                                <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                     <button 
                                        v-for="t in dictionaries.mealTypes" 
                                        :key="t.id" 
                                        @click="selectMealType(t.id)"
                                        type="button"
                                        class="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors border tap-effect flex items-center gap-1.5"
                                        :class="formData.meal_type === t.id ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'"
                                    >
                                        {{ t.name }}
                                        <span v-if="formData.meal_type === t.id" class="material-icons-round text-[10px]">check</span>
                                    </button>
                                </div>
                            </div>

                            <div class="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900">
                                        <span class="material-icons-round text-xl">restaurant_menu</span>
                                    </div>
                                    <div>
                                        <div class="text-sm font-black text-slate-900">Выход рецепта</div>
                                        <div class="text-[10px] font-bold text-slate-400">На сколько порций этот состав?</div>
                                    </div>
                                </div>
                                 
                                <div class="flex items-center gap-2">
                                    <button 
                                        @click="formData.batch_yield = Math.max(1, (formData.batch_yield || 1) - 1); platform.haptic.selection()"
                                        class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-transform"
                                    >
                                        <span class="material-icons-round text-base">remove</span>
                                    </button>
                                    <input
                                        v-model.number="formData.batch_yield" 
                                        type="number" 
                                        inputmode="numeric"
                                        placeholder="1"
                                        class="w-10 h-8 bg-transparent text-slate-900 font-black text-center outline-none border-none text-lg"
                                        @focus="$event.target.select()"
                                    >
                                    <button 
                                        @click="formData.batch_yield = (formData.batch_yield || 1) + 1; platform.haptic.selection()"
                                        class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 active:scale-90 transition-transform"
                                    >
                                        <span class="material-icons-round text-base">add</span>
                                    </button>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <div class="text-[10px] font-bold text-slate-400 pl-2">Состав на {{ formData.batch_yield || 1 }} порц.</div>
                                <div v-if="formData.ingredients.length > 0" class="bg-slate-50 rounded-2xl p-2 space-y-1">
                                    <div v-for="(ing, idx) in formData.ingredients" :key="idx" class="flex items-center gap-3 p-2 bg-white rounded-xl border shadow-sm" :class="ing.product === null ? 'border-yellow-400 bg-yellow-50' : 'border-slate-100'">
                                        <div class="w-1.5 h-1.5 rounded-full bg-slate-900 ml-1"></div>
                                        <div class="flex-1 font-bold text-slate-700 text-sm truncate">{{ ing.name }}</div>
                                        
                                        <div v-if="editingIngredientIndex === idx" class="flex items-center gap-1">
                                            <input 
                                                v-model="tempAmount" 
                                                type="number" 
                                                inputmode="decimal"
                                                class="ing-edit-input w-16 p-1 bg-slate-50 rounded-lg font-bold text-center outline-none border border-slate-200 focus:border-slate-400 text-base"
                                                @keydown.enter="saveIngredientAmount(idx)"
                                                @blur="saveIngredientAmount(idx)"
                                            >
                                            <span class="text-[10px] font-bold text-slate-400">{{ ing.unit }}</span>
                                        </div>
                                        <button 
                                            v-else
                                            @click="startEditingIngredient(idx, ing.amount)"
                                            class="font-bold text-slate-500 text-xs bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
                                        >
                                            {{ ing.amount }} {{ ing.unit }}
                                        </button>

                                        <button v-if="ing.product === null" @click="createProductFromIngredient(ing)" class="text-[10px] font-bold text-yellow-600 bg-yellow-100 px-2 py-1 rounded-lg border border-yellow-200 hover:bg-yellow-200 transition-colors whitespace-nowrap">
                                            Создать в базе
                                        </button>

                                        <button @click="openIngredientSearch(idx)" class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                                            <span class="material-icons-round text-base">search</span>
                                        </button>

                                        <button @click="removeIngredient(idx)" class="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-lg hover:bg-red-50">
                                            <span class="material-icons-round text-sm">close</span>
                                        </button>
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
                                    Дополнительно
                                </button>
                            </div>

                            <Transition name="slide-fade">
                                <div v-if="showAdditionalDetails" class="space-y-4 pt-2">
                                    
                                    <div class="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
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

                                    <div class="space-y-1">
                                         <div class="flex flex-wrap gap-2 min-h-[36px]">
                                            <button 
                                                @click="openTagSelector"
                                                class="h-9 px-3 rounded-xl bg-slate-900 text-white shadow-md flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-slate-800 transition-colors tap-effect"
                                            >
                                                <span class="material-icons-round text-sm">add</span> Тег
                                            </button>
                                            <span v-for="tagId in formData.tags" :key="tagId" class="h-9 px-3 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-600 shadow-sm">
                                                <span>{{ tagById.get(tagId)?.icon }}</span>
                                                <span>{{ tagById.get(tagId)?.name }}</span>
                                                <button @click="tagById.get(tagId) && toggleTag(tagById.get(tagId))" class="ml-1 text-slate-300 hover:text-slate-900"><span class="material-icons-round text-sm">close</span></button>
                                            </span>
                                        </div>
                                    </div>

                                    <textarea 
                                        v-model="formData.description" 
                                        placeholder="Заметки / Рецепт" 
                                        class="w-full p-4 bg-slate-50 rounded-2xl font-medium text-slate-700 outline-none focus:ring-0 border-none min-h-[120px] text-base leading-relaxed"
                                    ></textarea>

                                </div>
                            </Transition>

                            <div v-if="formData.id" class="pt-4">
                                <button @click="handleDelete" class="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 tap-effect active:bg-slate-200 transition-colors">
                                    <span class="material-icons-round text-sm">delete_outline</span>
                                    Удалить блюдо
                                </button>
                            </div>
                            
                            <div class="pt-4">
                                <button @click="handleSave" class="btn-primary w-full shadow-lg text-sm font-bold flex items-center justify-center gap-2" :class="formData.name ? 'bg-slate-900' : 'bg-slate-300 cursor-not-allowed'" :disabled="!formData.name">
                                    <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                                    {{ isSaving ? 'Сохранение...' : 'Сохранить блюдо' }}
                                </button>
                            </div>
                        </div>

                    </div>

                </div>

                <div v-else class="absolute inset-0 bg-slate-50 overflow-y-auto pb-20 pt-4 px-4 no-scrollbar">
                    <div class="space-y-6">
                         <div v-for="group in groupedTags" :key="group.code" class="space-y-3">
                            <div class="flex items-center gap-2 px-1">
                                <div class="text-xs font-black text-slate-400">{{ group.label }}</div>
                                <div class="h-[1px] bg-slate-200 flex-1"></div>
                            </div>
                            
                            <div class="flex flex-wrap gap-2">
                                 <button 
                                    v-for="tag in group.tags" 
                                    :key="tag.id" 
                                    @click="toggleTag(tag)"
                                    class="px-4 py-3 rounded-2xl text-sm font-bold transition-colors border tap-effect flex items-center gap-2"
                                    :class="isTagSelected(tag) ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border-slate-200'"
                                 >
                                    <span>{{ tag.icon }}</span>
                                    <span>{{ tag.name }}</span>
                                    <span v-if="isTagSelected(tag)" class="material-icons-round text-sm ml-1">check</span>
                                 </button>
                            </div>
                         </div>
                    </div>
                    <div class="h-10"></div>
                </div>
                
                </transition>
            </div>

            <div v-show="showIngredientOverlay" class="fixed inset-0 z-[80] flex flex-col">
                <div class="absolute inset-0 bg-black/50" @click="closeIngredientOverlay"></div>
                <div class="relative z-10 mt-auto bg-white rounded-t-3xl h-[92vh] flex flex-col shadow-2xl">
                    <div class="w-full pt-3 pb-1 shrink-0">
                        <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto"></div>
                    </div>
                    <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                        <button @click="closeIngredientOverlay" class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 tap-effect">
                            <span class="material-icons-round text-xl">close</span>
                        </button>
                        
                        <div class="flex items-center gap-2">
                            <button 
                                @click="openCreateProduct"
                                class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
                            >
                                <span class="material-icons-round text-xl">add</span>
                            </button>
                            <button 
                                @click="confirmIngredients"
                                v-if="ingredientLinkIndex === null"
                                class="px-4 py-2 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg tap-effect active:scale-95 transition-transform"
                                :disabled="selectedProductsInOverlay.length === 0"
                                :class="selectedProductsInOverlay.length === 0 ? 'opacity-50 cursor-not-allowed' : ''"
                            >
                                Готово ({{ selectedProductsInOverlay.length }})
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
                                    autofocus
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
                                    <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{{ prod.unit }}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto px-5 py-3">
                        <div v-if="selectedProductsInOverlay.length > 0" class="space-y-1">
                            <div class="text-[10px] font-bold text-slate-400 mb-2">Выбрано ({{ selectedProductsInOverlay.length }}):</div>
                            <div 
                                v-for="prod in selectedProductsInOverlay" 
                                :key="prod.id"
                                class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200"
                            >
                                <div class="flex-1 font-bold text-slate-700 text-sm truncate">{{ prod.name }}</div>
                                <div class="flex items-center gap-2">
                                    <input 
                                        :data-product-id="prod.id"
                                        v-model.number="productAmounts[prod.id]"
                                        type="number"
                                        inputmode="decimal"
                                        class="w-20 p-2 bg-slate-100 rounded-xl font-bold text-center text-sm outline-none"
                                        @keydown.enter="focusNextProductInput(prod.id)"
                                    >
                                    <span class="text-sm font-bold text-slate-400">{{ prod.unit }}</span>
                                </div>
                                <button @click.stop="removeSelectedProduct(prod)" class="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500">
                                    <span class="material-icons-round text-sm">close</span>
                                </button>
                            </div>
                        </div>
                        <div v-else class="text-center py-12 text-slate-400 text-sm">
                            <span class="material-icons-round text-4xl text-slate-200 mb-2">search</span>
                            <div>Начните вводить название продукта</div>
                        </div>
                    </div>
                </div>
            </div>
      </div>
      <ProductDetailModal 
          :is-open="showCreateProductModal"
          :product="newProductTarget"
          :z-index="100"
          @saved="onProductCreated"
          @close="showCreateProductModal = false"
      />
    </div>
  </Transition>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>
