// supabase/functions/telegram-auth/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const botToken = Deno.env.get('BOT_TOKEN')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // Важный ключ!

serve(async (req) => {
  try {
    // 1. Получаем данные от фронтенда
    const { initData } = await req.json()
    if (!initData) throw new Error('No initData provided')

    // 2. Валидация данных Telegram
    // Нам нужно убедиться, что данные не подделаны
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')
    urlParams.delete('hash')

    // Сортируем параметры по алфавиту (требование Telegram)
    const dataCheckString = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n')

    // Создаем секретный ключ из токена бота
    const secretKey = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode("WebAppData"), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign", "verify"]
    )
    
    // Подписываем токен бота этим ключом
    const secret = await crypto.subtle.sign(
      "HMAC", 
      secretKey, 
      new TextEncoder().encode(botToken)
    )

    // Теперь используем полученный секрет для проверки данных
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

    // Переводим в HEX строку для сравнения
    const hex = Array.from(new Uint8Array(verification))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Если хеши не совпали — это хакер!
    if (hex !== hash) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }

    // 3. Если мы здесь — данные настоящие. Разбираем их.
    const userStr = urlParams.get('user')
    if (!userStr) throw new Error('No user data')
    const tgUser = JSON.parse(userStr)

    // 4. Работаем с базой через Supabase Admin (с правами бога)
    const supabaseAdmin = createClient(
      supabaseUrl ?? '',
      supabaseServiceRoleKey ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Ищем пользователя по telegram_id в нашей таблице profiles
    // Но так как profiles связана с auth.users, нам проще искать/создавать через email-трюк
    // Мы будем генерировать фейковый email: telegram_ID@tg.ma
    const email = `${tgUser.id}@tg.ma`
    const password = `tg_pass_${tgUser.id}_secret` // Пароль не важен, пользователь его не вводит

    // Пытаемся создать пользователя (если его нет)
    // Мы кладем данные ТГ в user_metadata, чтобы сработал наш триггер в БД
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
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

    let targetUserId = user?.id

    // Если ошибка "User already registered", значит юзер старый. Просто находим его ID.
    if (createError && createError.message.includes('already registered')) {
        // Получаем ID существующего юзера (через админку нельзя получить ID по email напрямую просто так,
        // поэтому мы используем listUsers или просто входим)
        // Но проще всего — просто выполнить SignIn от имени админа без пароля (createSession)
        // Зная email, мы можем найти его ID через запрос к таблице profiles? Нет, RLS мешает.
        // Самый простой способ в Edge Functions:
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        // Это не оптимально для миллионов юзеров, но для старта пойдет. 
        // Лучше использовать getUserByEmail, но он в beta.
        // Давай сделаем проще: просто входим.
    }

    // Генерируем сессию (Login)
    const { data: sessionData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    })

    if (loginError) {
      throw loginError
    }

    // 5. Возвращаем токен фронтенду
    return new Response(
      JSON.stringify(sessionData),
      { headers: { "Content-Type": "application/json" } },
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})