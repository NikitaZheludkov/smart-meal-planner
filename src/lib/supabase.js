import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Добавляем настройки auth, чтобы отключить проблемные блокировки
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: false, // <-- ЭТО РЕШАЕТ ПРОБЛЕМУ AbortError
    persistSession: true,
    detectSessionInUrl: true
  }
})