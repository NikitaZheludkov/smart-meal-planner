import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const householdId = ref(null)
  const isAuth = ref(false)
  const loading = ref(true)

  // Данные для тестового входа (эмуляция TMA)
  const TEST_CREDENTIALS = {
    email: 'dev@telegram.mini.app',
    password: 'dev-password-123'
  }

  // Инициализация
  const init = async () => {
    loading.value = true
    
    // Проверяем, есть ли активная сессия
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session?.user) {
      await handleUserSession(session.user)
    } else {
      resetState()
    }
    
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await handleUserSession(session.user)
      } else {
        resetState()
      }
      loading.value = false
    })
    
    loading.value = false
  }

  // Логика обработки пользователя
  const handleUserSession = async (authUser) => {
    user.value = authUser
    isAuth.value = true
    
    // Получаем ID семьи
    const { data } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', authUser.id)
        .single()
        
    if (data && data.household_id) {
        householdId.value = data.household_id
    }
  }

  const resetState = () => {
    user.value = null
    householdId.value = null
    isAuth.value = false
  }

  // --- ACTIONS ---

  // Функция для быстрой разработки
  const loginAsTestUser = async () => {
    loading.value = true
    try {
        // 1. Пробуем войти
        const { error: signInError } = await supabase.auth.signInWithPassword(TEST_CREDENTIALS)
        
        // 2. Если ошибка "Invalid login" (пользователя нет), то регистрируем его
        if (signInError && signInError.message.includes('Invalid login')) {
            console.log('Тестовый пользователь не найден, создаем нового...')
            const { error: signUpError } = await supabase.auth.signUp(TEST_CREDENTIALS)
            if (signUpError) throw signUpError
        } else if (signInError) {
            throw signInError
        }
    } catch (e) {
        console.error('Ошибка тестового входа:', e)
        throw e
    } finally {
        loading.value = false
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    resetState()
    // Перезагрузка страницы для очистки состояний
    window.location.reload()
  }

  return { 
    user, 
    householdId, 
    isAuth, 
    loading, 
    init, 
    loginAsTestUser, // Новая функция
    signOut
  }
})