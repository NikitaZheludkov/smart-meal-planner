import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing! Check .env file.')
} else {
  console.log('Supabase client initialized with URL:', supabaseUrl.substring(0, 15) + '...')
}

// Добавляем настройки auth, чтобы отключить проблемные блокировки
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: false,
    persistSession: true,
    detectSessionInUrl: false, // Отключаем, так как авторизация идет через initData
    autoRefreshToken: true,
    storageKey: 'sb-smart-meal-auth'
  },
  global: {
    headers: { 'x-application-name': 'smart-meal-planner' }
  }
})