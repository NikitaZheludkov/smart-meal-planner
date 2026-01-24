// supabase/functions/telegram-auth/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// ИСПРАВЛЕНИЕ: Используем npm-спецификатор для стабильности
import { createClient } from "npm:@supabase/supabase-js@2"

const botToken = Deno.env.get('BOT_TOKEN')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS заголовки нужны, чтобы браузер не блокировал запросы с фронтенда
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Обработка Preflight запроса (OPTIONS) - стандартная процедура для браузеров
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { initData } = await req.json()
    if (!initData) {
        throw new Error('No initData provided')
    }

    // --- 1. ВАЛИДАЦИЯ ДАННЫХ TELEGRAM ---
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')
    urlParams.delete('hash')

    // Сортировка параметров (a-z)
    const dataCheckString = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n')

    // Crypto API доступно в Deno глобально (импортировать не нужно)
    const secretKey = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode("WebAppData"), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign", "verify"]
    )

    const secret = await crypto.subtle.sign(
      "HMAC", 
      secretKey, 
      new TextEncoder().encode(botToken)
    )

    const signingKey = await crypto.subtle.importKey(
      "raw", 
      secret, 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign", "verify"]
    )

    const verification = await crypto.subtle.sign(
      "HMAC", 
      signingKey, 
      new TextEncoder().encode(dataCheckString)
    )

    const hex = Array.from(new Uint8Array(verification))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (hex !== hash) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // --- 2. ЛОГИКА АВТОРИЗАЦИИ (Login / Registration) ---
    const userStr = urlParams.get('user')
    if (!userStr) throw new Error('No user data')
    const tgUser = JSON.parse(userStr)

    // Создаем админский клиент Supabase
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Генерируем "технические" данные для входа
    const email = `${tgUser.id}@tg.ma`
    const password = `tg_pass_${tgUser.id}_secret`

    // Сценарий А: Пробуем сразу войти (если пользователь уже есть)
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    })

    // Если вошли успешно - отдаем сессию
    if (!signInError && signInData.session) {
        return new Response(
            JSON.stringify(signInData),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
    }

    // Сценарий Б: Если не вошли (пользователя нет) - регистрируем
    // Данные кладем в meta_data, чтобы сработал наш SQL-триггер handle_new_user
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            username: tgUser.username,
            avatar_url: tgUser.photo_url
        }
    })

    if (signUpError) {
        throw signUpError
    }

    // После регистрации нужно сразу войти, чтобы получить токены
    const { data: finalSession, error: finalLoginError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
    })

    if (finalLoginError) throw finalLoginError

    // Отдаем сессию фронтенду
    return new Response(
      JSON.stringify(finalSession),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})