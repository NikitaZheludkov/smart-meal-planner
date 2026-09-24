<script setup>
import { formatUnit } from '../lib/utils'
import { ref, watch, onUnmounted } from 'vue'
import { useProductStore } from '../stores/products'
import { useDictionariesStore } from '../stores/dictionaries'
import { usePlatformStore } from '../stores/platform'
import { useUIStore } from '../stores/ui'

const props = defineProps({
  isOpen: Boolean,
  product: Object,
  zIndex: {
    type: [Number, String],
    default: 70
  }
})

const emit = defineEmits(['close', 'saved', 'deleted'])

const productStore = useProductStore()
const dictionaries = useDictionariesStore()
const platform = usePlatformStore()
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

const units = ['Кг', 'Г', 'Л', 'Мл', 'Шт', 'Упак']
const modalRegistryId = `product-detail-${Math.random().toString(36).slice(2)}`

watch(() => props.isOpen, (newVal) => {
    ui.syncModalState(modalRegistryId, newVal)
    if (newVal) {
        isSaving.value = false // Reset loading state
    }
}, { immediate: true })

onUnmounted(() => {
    ui.clearModalState(modalRegistryId)
})

watch(() => props.product, (newVal) => {
  if (newVal) {
    formData.value = JSON.parse(JSON.stringify(newVal))

    if (!formData.value.id) {
        isEditing.value = true
        formData.value.unit = 'Кг'
        // Категорию не выбираем за пользователя — иначе она молча остаётся
        // "Овощи и фрукты" (первая в списке), даже если он про неё не думал,
        // и данные по категориям тихо разъезжаются.
        formData.value.category = ''
    } else {
        isEditing.value = false
    }
  }
}, { immediate: true })

const handleSave = async () => {
  // Валидация
  if (!formData.value.name || isSaving.value) return
  if (!formData.value.category) {
    ui.showToast('Выберите категорию продукта', 'error')
    return
  }

  isSaving.value = true
  platform.haptic.notification('success')
  ui.addLog(`Попытка сохранения продукта: ${formData.value.name}`, 'info', formData.value)
  
  try {
      if (formData.value.id) {
        await productStore.updateProduct(formData.value.id, formData.value)
        ui.addLog('Продукт успешно обновлен', 'info')
        emit('saved', formData.value)
      } else {
        const newProduct = await productStore.addProduct(formData.value)
        ui.addLog('Продукт успешно добавлен', 'info')
        emit('saved', newProduct)
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
      platform.haptic.notification('error')
      ui.showToast('Не удалось сохранить продукт. Проверьте соединение и попробуйте ещё раз.', 'error')
  } finally {
      isSaving.value = false
  }
}

const handleDelete = async () => {
    platform.haptic.notification('warning')
    if (await ui.confirm('Удалить продукт? Это может повлиять на рецепты, где он используется.', { okText: 'Удалить', cancelText: 'Отмена' })) {
        // Закрываем модалку до самого удаления: иначе вотчер в ProductsView,
        // следящий за исчезновением просматриваемого продукта из списка
        // (защита от "зависшей" модалки при realtime-удалении), успевает
        // сработать первым и показать дублирующий тост.
        emit('close')
        try {
          await productStore.deleteProduct(formData.value.id)
        } catch (e) {
          console.error('Delete error:', e)
          platform.haptic.notification('error')
          ui.showToast('Не удалось удалить продукт. Попробуйте ещё раз.', 'error')
        }
    }
}

const handleCancel = () => {
    platform.haptic.impact('light')
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
    <div v-if="isOpen" class="fixed inset-0 flex flex-col justify-end" :style="{ zIndex: zIndex }" @click.self="$emit('close')">
      <div class="absolute inset-0 bg-black/40 transition-opacity"></div>
      <div class="sheet modal-content">
          <div class="sheet-handle"></div>
          <div class="sheet-header z-20">
            <button @click="handleCancel" class="sheet-close tap-effect" aria-label="Закрыть">
              <span class="material-icons-round text-xl">close</span>
            </button>
            <h3 class="sheet-title">
              {{ isEditing ? (formData.id ? 'Редактирование' : 'Новый продукт') : 'Продукт' }}
            </h3>
            <div>
              <button v-if="isEditing" @click="handleSave" class="sheet-action tap-effect" :disabled="!formData.name || !formData.category || isSaving">
                <span v-if="isSaving" class="material-icons-round text-sm animate-spin">sync</span>
                {{ isSaving ? 'Сохр...' : 'Сохранить' }}
              </button>
              <button v-else @click="isEditing = true" class="sheet-close !text-slate-900 tap-effect" aria-label="Редактировать">
                <span class="material-icons-round text-lg">edit</span>
              </button>
            </div>
          </div>
          <!-- Content -->
          <div class="min-h-0 overflow-y-auto px-6 pt-5 pb-[calc(32px+env(safe-area-inset-bottom,0px))] no-scrollbar bg-slate-50 relative z-0">
            <div v-if="!isEditing" class="flex flex-col space-y-4 items-center">
              <div class="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-4xl border border-slate-100">
                {{ getCategoryIcon(formData.category) }}
              </div>
              <div class="text-center">
                <h2 class="text-xl card-title leading-tight mb-1">{{ formData.name }}</h2>
                <span class="text-xs text-secondary">{{ formData.category }}</span>
              </div>
              <div class="bg-white p-4 rounded-2xl w-full border border-slate-100 shadow-sm flex justify-between items-center">
                <span class="text-xs font-bold text-slate-400">Единица измерения</span>
                <span class="card-title">{{ formatUnit(formData.unit) }}</span>
              </div>
            </div>
            <div v-else class="space-y-5">
              <div class="space-y-1">
                <label class="text-[10px] font-bold text-slate-400 ml-1">Название</label>
                <input v-model="formData.name" placeholder="Например: Молоко" class="w-full p-4 bg-white rounded-2xl font-bold text-slate-900 outline-none border-none text-lg shadow-sm" autoFocus>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 ml-1">Категория</label>
                  <div class="relative">
                    <select v-model="formData.category" class="w-full p-3 bg-white rounded-xl font-bold outline-none border-none appearance-none text-sm shadow-sm" :class="formData.category ? 'text-slate-900' : 'text-slate-400'">
                      <option value="" disabled>Выберите категорию</option>
                      <option v-for="cat in dictionaries.productCategories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
                      <option v-if="dictionaries.productCategories.length === 0" value="Разное">Разное</option>
                    </select>
                    <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                  </div>
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 ml-1">Единица</label>
                  <div class="relative">
                    <select v-model="formData.unit" class="w-full p-3 bg-white rounded-xl font-bold text-slate-900 outline-none border-none appearance-none text-sm shadow-sm">
                      <option v-for="u in units" :key="u" :value="u">{{ formatUnit(u) }}</option>
                    </select>
                    <span class="material-icons-round absolute right-3 top-3 text-slate-400 pointer-events-none text-sm">expand_more</span>
                  </div>
                </div>
              </div>
              <div v-if="formData.id" class="pt-2">
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
