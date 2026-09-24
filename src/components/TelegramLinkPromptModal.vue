<script setup>
import { useAuthStore } from '../stores/auth'
import { usePlatformStore } from '../stores/platform'

const auth = useAuthStore()
const platform = usePlatformStore()

const botLink = import.meta.env.VITE_TELEGRAM_BOT_LINK

const handleOpenTelegram = () => {
    platform.haptic.impact('light')
    auth.dismissTelegramLinkPrompt()
    if (botLink) window.open(botLink, '_blank')
}

const handleDismiss = () => {
    platform.haptic.impact('light')
    auth.dismissTelegramLinkPrompt()
}
</script>

<template>
  <Transition name="modal">
    <div v-if="auth.showTelegramLinkPrompt" class="fixed inset-0 z-[3000] flex items-center justify-center px-5" @click.self="handleDismiss">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="relative w-full max-w-sm bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden">
        <div class="p-6 text-center">
          <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">
            🔐
          </div>
          <div class="text-sm font-black text-slate-900">Аккаунт создан!</div>
          <p class="mt-2 text-xs text-slate-500 font-bold leading-relaxed">
            Сейчас у аккаунта нет запасного способа входа — если забудете пароль, восстановить доступ будет нечем.
            Привяжите Telegram: это займёт 10 секунд и станет вашим способом восстановления.
          </p>
        </div>
        <div class="px-5 pb-5 flex flex-col gap-2">
          <button @click="handleOpenTelegram" class="w-full py-3.5 rounded-full bg-slate-900 text-white font-black text-xs tap-effect flex items-center justify-center gap-2">
            <span class="material-icons-round text-base">send</span>
            Открыть Telegram и привязать
          </button>
          <button @click="handleDismiss" class="w-full py-3 rounded-full bg-slate-100 text-slate-500 font-black text-xs tap-effect">
            Позже
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
