<script setup>
import { ref } from 'vue'
import { pb } from '../lib/supabase'
import { isNetworkError } from '../lib/utils'

const props = defineProps({
  token: { type: String, required: true }
})

const emit = defineEmits(['done'])

const password = ref('')
const passwordConfirm = ref('')
const showPassword = ref(false)
const showPasswordConfirm = ref(false)
const submitting = ref(false)
const formError = ref('')
const success = ref(false)

const validate = () => {
  if (!password.value) return 'Введите новый пароль'
  if (password.value.length < 8) return 'Пароль должен быть не короче 8 символов'
  if (password.value !== passwordConfirm.value) return 'Пароли не совпадают'
  return ''
}

const handleSubmit = async () => {
    formError.value = ''
    const validationError = validate()
    if (validationError) {
        formError.value = validationError
        return
    }

    submitting.value = true
    try {
        await pb.collection('users').confirmPasswordReset(props.token, password.value, passwordConfirm.value)
        success.value = true
    } catch (e) {
        formError.value = isNetworkError(e)
            ? 'Проблема с подключением. Проверьте интернет и попробуйте снова.'
            : 'Ссылка для сброса пароля недействительна или устарела. Запросите новую на экране входа.'
    } finally {
        submitting.value = false
    }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white relative overflow-hidden">
    <div class="absolute -top-20 -right-20 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-0 -left-10 w-72 h-72 bg-blue-50 rounded-full blur-3xl opacity-60"></div>

    <div class="flex-1 flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto text-center z-10">
      <div class="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center mb-6 border border-slate-100 shadow-xl shadow-indigo-100/50 relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-50 to-white"></div>
        <span class="text-5xl relative z-10">🔒</span>
      </div>

      <h1 class="app-brand mb-2">Новый пароль</h1>
      <p class="text-slate-400 text-sm font-bold mb-8">
        Придумайте новый пароль для входа
      </p>

      <div v-if="success" class="w-full space-y-4">
        <div class="bg-emerald-50 text-emerald-600 text-xs font-bold px-4 py-3 rounded-xl border border-emerald-100">
          Пароль обновлён. Теперь можно войти с новым паролем.
        </div>
        <button
          @click="$emit('done')"
          class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform"
        >
          Перейти ко входу
        </button>
      </div>

      <form v-else @submit.prevent="handleSubmit" class="w-full bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-xl shadow-indigo-100/20 space-y-4 text-left">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Новый пароль</label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              autofocus
              placeholder="••••••••"
              class="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
            >
            <button
              type="button"
              @click="showPassword = !showPassword"
              tabindex="-1"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <span class="material-icons-round text-lg">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
        </div>

        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Повторите пароль</label>
          <div class="relative">
            <input
              v-model="passwordConfirm"
              :type="showPasswordConfirm ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="••••••••"
              class="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
            >
            <button
              type="button"
              @click="showPasswordConfirm = !showPasswordConfirm"
              tabindex="-1"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <span class="material-icons-round text-lg">{{ showPasswordConfirm ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
        </div>

        <div v-if="formError" class="bg-red-50 text-red-500 text-xs font-bold px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2">
          <span class="material-icons-round text-base shrink-0">error_outline</span>
          <span>{{ formError }}</span>
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <span v-if="submitting" class="material-icons-round animate-spin text-lg">donut_large</span>
          <span>Сохранить пароль</span>
        </button>
      </form>
    </div>
  </div>
</template>
