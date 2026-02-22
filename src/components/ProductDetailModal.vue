<script setup>
import { ref, watch } from 'vue'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { useTelegramStore } from '../stores/telegram'
import { useUIStore } from '../stores/ui'

const props = defineProps({
  isOpen: Boolean,
  product: Object,
  zIndex: {
    type: [Number, String],
    default: 60
  }
})

const emit = defineEmits(['close', 'saved', 'deleted'])

const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const telegram = useTelegramStore()
const ui = useUIStore()

const isEditing = ref(false)
const isSaving = ref(false)

const formData = ref({
    id: null,
    name: '',
    unit: 'Кг',
    category: ''
})

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

const units = ['Кг', 'Л', 'Шт', 'Упак']

watch(() => props.product, (newVal) => {
  if (newVal) {
    formData.value = JSON.parse(JSON.stringify(newVal))
    
    if (!formData.value.category && dictionaries.productCategories.length) {
        formData.value.category = dictionaries.productCategories[0].name
    }
    
    if (!formData.value.id) {
        isEditing.value = true
        formData.value.unit = 'Кг'
        formData.value.category = dictionaries.productCategories[0]?.name || 'Разное'
    } else {
        isEditing.value = false
    }
  }
}, { immediate: true })

const handleSave = async () => {
  // Валидация
  if (!formData.value.name || isSaving.value) return
  
  isSaving.value = true
  telegram.haptic.notification('success')
  ui.addLog(`Попытка сохранения продукта: ${formData.value.name}`, 'info', formData.value)
  
  try {
      if (formData.value.id) {
        await productStore.updateProduct(formData.value.id, formData.value)
        ui.addLog('Продукт успешно обновлен', 'info')
      } else {
        await productStore.addProduct(formData.value)
        ui.addLog('Продукт успешно добавлен', 'info')
      }
      // Закрываем только после успешного сохранения
      isEditing.value = false
      emit('close')
  } catch (e) {
      ui.addLog('Ошибка при сохранении продукта', 'error', {
        error: e.message,
        stack: e.stack,
        code: e.code
      })
      console.error('Save error:', e)
      telegram.haptic.notification('error')
      alert('Не удалось сохранить продукт. Проверьте соединение и попробуйте ещё раз.')
  } finally {
      isSaving.value = false
  }
}

const handleDelete = async () => {
    telegram.haptic.notification('warning')
    if(confirm('Удалить продукт? Это может повлиять на рецепты, где он используется.')) {
        try {
          await productStore.deleteProduct(formData.value.id)
          emit('close')
        } catch (e) {
          console.error('Delete error:', e)
          telegram.haptic.notification('error')
          alert('Не удалось удалить продукт. Попробуйте ещё раз.')
        }
    }
}

const handleCancel = () => {
    telegram.haptic.impact('light')
    if (!formData.value.id) {
        emit('close')
    } else if (isEditing.value) {
        isEditing.value = false
        formData.value = JSON.parse(JSON.stringify(props.product))
    } else {
        emit('close')
    }
}
</script>

<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4" @click.self="$emit('close')">
      
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"></div>
      
      <div class="bg-white w-full max-w-sm h-[60vh] sm:h-[600px] rounded-t-[32px] sm:rounded-[32px] shadow-2xl relative z-10 flex flex-col overflow-hidden modal-content">
        
        <div class="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white z-20 min-h-[70px]">
        <div class="w-20 flex justify-start">
            <button 
                @click="handleCancel" 
                class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 tap-effect hover:bg-slate-200 active:scale-95 transition-transform"
            >
                <span class="material-icons-round text-xl">close</span>
            </button>
        </div>
        
        <h3 class="text-lg font-bold text-slate-900 truncate px-2 text-center flex-1">
            {{ isEditing ? (formData.id ? 'Редактирование' : 'Новый продукт') : 'Продукт' }}
        </h3>

        <div class="w-20 flex justify-end items-center gap-2">
            <template v-if="isEditing">
                 <button 
                    @click="handleSave" 
                    class="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg tap-effect active:scale-95 transition-transform transition-colors flex items-center gap-2"
                    :class="formData.name && !isSaving ? 'bg-slate-900' : 'bg-slate-300 cursor-not-allowed'"
                    :disabled="!formData.name || isSaving"
                >
                    <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                    {{ isSaving ? '...' : 'Готово' }}
                </button>
            </template>
            <template v-else>
                 <button 
                    @click="isEditing = true" 
                    class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center tap-effect hover:bg-indigo-100 active:scale-95 transition-transform"
                >
                    <span class="material-icons-round text-xl">edit</span>
                </button>
            </template>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-6 pb-8 pt-4 no-scrollbar bg-slate-50 relative z-0">
        
        <div v-if="!isEditing" class="flex flex-col space-y-6 items-center pt-6">
            <div class="w-24 h-24 bg-white rounded-3xl flex items-center justify-center text-5xl shadow-sm border border-slate-100">
                {{ getCategoryIcon(formData.category) }}
            </div>
            
            <div class="text-center">
                <h2 class="text-2xl font-black text-slate-900 leading-tight mb-2">{{ formData.name }}</h2>
                <span class="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                    {{ formData.category }}
                </span>
            </div>

            <div class="bg-white p-4 rounded-2xl w-full border border-slate-100 shadow-sm flex justify-between items-center">
                <span class="text-xs font-bold text-slate-400 uppercase">Единица измерения</span>
                <span class="font-black text-slate-900 text-lg">{{ formData.unit }}</span>
            </div>
        </div>

        <div v-else class="space-y-6">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Название</label>
                <input 
                    v-model="formData.name" 
                    placeholder="Например: Молоко" 
                    class="w-full p-4 bg-white rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 ring-indigo-500/10 border border-slate-100 text-lg shadow-sm"
                    autoFocus
                >
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Категория</label>
                    <div class="relative">
                        <select v-model="formData.category" class="w-full p-3 bg-white rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm shadow-sm">
                            <option v-for="cat in dictionaries.productCategories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
                             <option v-if="dictionaries.productCategories.length === 0" value="Разное">Разное</option>
                        </select>
                        <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Ед. изм.</label>
                    <div class="relative">
                        <select v-model="formData.unit" class="w-full p-3 bg-white rounded-xl font-bold text-slate-900 outline-none border border-slate-100 appearance-none text-sm shadow-sm">
                            <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
                        </select>
                        <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                    </div>
                </div>
            </div>

            <div v-if="formData.id" class="pt-6 mt-6 border-t border-slate-200">
                <button @click="handleDelete" class="w-full py-3 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span class="material-icons-round">delete</span> Удалить продукт
                </button>
            </div>
        </div>

      </div>
    </div>
    </div>
  </Transition>
</template>
