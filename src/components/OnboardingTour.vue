<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useUIStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import { usePlatformStore } from '../stores/platform'
import { TOUR_SLIDES, TOUR_VERSION } from '../lib/tour'

// Мини-гайд: короткие карточки с макетом экрана сверху и 2–3 пунктами снизу.
// Листается кнопками и свайпом; закрытие (в том числе «Пропустить») отмечает
// гайд просмотренным.
const ui = useUIStore()
const auth = useAuthStore()
const platform = usePlatformStore()

const index = ref(0)
const direction = ref('slide-left')

const modalRegistryId = `onboarding-${Math.random().toString(36).slice(2)}`
watch(() => ui.isTourOpen, (open) => {
  ui.syncModalState(modalRegistryId, open)
  if (open) {
    index.value = 0
    direction.value = 'slide-left'
  }
}, { immediate: true })
onUnmounted(() => ui.clearModalState(modalRegistryId))
const slide = computed(() => TOUR_SLIDES[index.value])
const isLast = computed(() => index.value === TOUR_SLIDES.length - 1)

const go = (next) => {
  if (next < 0 || next >= TOUR_SLIDES.length || next === index.value) return
  direction.value = next > index.value ? 'slide-left' : 'slide-right'
  index.value = next
  platform.haptic.selection()
}
const nextOrClose = () => (isLast.value ? close() : go(index.value + 1))

const close = () => {
  platform.haptic.impact('light')
  ui.isTourOpen = false
  auth.markTourSeen(TOUR_VERSION)
}

// Свайп влево-вправо
let touchX = null
let touchY = null
const onTouchStart = (e) => {
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}
const onTouchEnd = (e) => {
  if (touchX === null) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  touchX = null
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
  go(index.value + (dx < 0 ? 1 : -1))
}
</script>

<template>
  <Transition name="fade">
    <div v-if="ui.isTourOpen" class="fixed inset-0 z-[95] bg-slate-50">
      <div class="h-full max-w-md mx-auto flex flex-col pt-app-header">
        <!-- Прогресс как в историях + «Пропустить» -->
        <div class="shrink-0 px-5 pt-3">
          <div class="flex gap-1">
            <button
              v-for="(s, i) in TOUR_SLIDES"
              :key="s.id"
              @click="go(i)"
              class="flex-1 h-1 rounded-full transition-colors duration-300"
              :class="i <= index ? 'bg-slate-900' : 'bg-slate-200'"
              :aria-label="`Шаг ${i + 1}`"
            ></button>
          </div>
          <div class="h-10 flex items-center justify-between">
            <span class="text-[11px] text-secondary">{{ index + 1 }} из {{ TOUR_SLIDES.length }}</span>
            <button v-if="!isLast" @click="close" class="text-[12px] font-semibold text-slate-500 px-1 py-2 tap-effect">Пропустить</button>
          </div>
        </div>

        <div class="flex-1 min-h-0 relative overflow-hidden" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
          <Transition :name="direction">
            <div :key="slide.id" class="absolute inset-0 overflow-y-auto px-5 pb-4 scroll-area">
              <!-- Мини-макет экрана -->
              <div class="h-[208px] rounded-[28px] bg-white border border-slate-100 shadow-sm flex items-center justify-center overflow-hidden px-4 select-none" aria-hidden="true">

                <div v-if="slide.id === 'hello'" class="flex flex-col items-center gap-4">
                  <div class="text-5xl animate-bounce">🥗</div>
                  <div class="flex items-center gap-1.5">
                    <div class="flex flex-col items-center gap-1">
                      <span class="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center"><span class="material-icons-outlined text-slate-700">restaurant_menu</span></span>
                      <span class="text-[10px] font-semibold text-slate-500">Блюда</span>
                    </div>
                    <span class="material-icons-round text-slate-300 text-base mb-4">arrow_forward</span>
                    <div class="flex flex-col items-center gap-1">
                      <span class="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center"><span class="material-icons-outlined text-slate-700">calendar_today</span></span>
                      <span class="text-[10px] font-semibold text-slate-500">План</span>
                    </div>
                    <span class="material-icons-round text-slate-300 text-base mb-4">arrow_forward</span>
                    <div class="flex flex-col items-center gap-1">
                      <span class="w-11 h-11 rounded-full bg-slate-900 flex items-center justify-center"><span class="material-icons-outlined text-white">shopping_bag</span></span>
                      <span class="text-[10px] font-semibold text-slate-500">Покупки</span>
                    </div>
                  </div>
                </div>

                <div v-else-if="slide.id === 'plan'" class="w-full max-w-[290px] space-y-2">
                  <div class="flex items-center gap-1">
                    <span class="h-7 px-2.5 mr-auto rounded-full border border-slate-200 text-[10px] font-semibold flex items-center gap-1"><span class="material-icons-round text-[13px]">auto_awesome</span>Идеи на неделю</span>
                    <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center ring-2 ring-amber-300"><span class="material-icons-round text-[15px]">tune</span></span>
                    <span class="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center"><span class="material-icons-round text-[15px]">grid_view</span></span>
                  </div>
                  <div class="rounded-2xl border border-slate-100 shadow-sm p-2.5">
                    <div class="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-slate-50">
                      <span class="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">12</span>
                      <span class="text-[9px] font-bold text-slate-500">понедельник</span>
                      <span class="ml-auto text-[9px] font-black text-slate-800">1 240 ккал</span>
                      <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center ring-2 ring-amber-300"><span class="material-icons-round text-[13px]">add</span></span>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5">
                      <div class="h-14 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center"><span class="text-base">🍳</span><span class="text-[8px] font-bold text-slate-800">Сырники</span></div>
                      <div class="h-14 rounded-xl bg-slate-50 flex flex-col items-center justify-center"><span class="text-sm opacity-30 grayscale">🍲</span><span class="text-[8px] font-bold text-slate-300">Обед</span></div>
                      <div class="h-14 rounded-xl bg-slate-50 flex flex-col items-center justify-center relative"><span class="text-sm opacity-30 grayscale">🍗</span><span class="text-[8px] font-bold text-slate-300">Ужин</span><span class="material-icons-round absolute -bottom-1 -right-1 text-[22px] text-slate-900 drop-shadow">touch_app</span></div>
                    </div>
                  </div>
                </div>

                <div v-else-if="slide.id === 'ideas'" class="w-full max-w-[290px] space-y-2">
                  <div class="flex items-center gap-1 text-[10px]">
                    <span class="chip !h-6 !px-2 !text-[10px] chip-active">Завтрак <span class="material-icons-round text-[12px] opacity-60">expand_more</span></span>
                    <span class="chip !h-6 !px-2 !text-[10px] chip-active">Обед <span class="material-icons-round text-[12px] opacity-60">expand_more</span></span>
                    <span class="chip !h-6 !px-2 !text-[10px] chip-active ring-2 ring-amber-300">Ужин · салат <span class="material-icons-round text-[12px] opacity-60">expand_more</span></span>
                  </div>
                  <div class="rounded-2xl border border-dashed border-slate-300 pl-3 pr-2 py-2 flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="text-[8px] font-semibold uppercase tracking-wide text-slate-400">Обед</div>
                      <div class="text-[12px] font-bold text-slate-900 leading-tight">Плов с булгуром</div>
                      <div class="text-[9px] text-slate-500 flex items-center gap-0.5"><span class="material-icons-round text-[11px] text-slate-400">shopping_cart</span>куриное бедро +2 · 450 ккал</div>
                    </div>
                    <span class="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><span class="material-icons-round text-[14px]">autorenew</span></span>
                    <span class="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><span class="material-icons-round text-[16px]">add</span></span>
                  </div>
                  <div class="rounded-2xl border border-dashed border-slate-300 pl-3 pr-2 py-2 flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="text-[8px] font-semibold uppercase tracking-wide text-slate-400"><span class="material-icons-round text-[9px] align-[-1px]">push_pin</span> Ужин</div>
                      <div class="text-[12px] font-bold text-slate-900 leading-tight">Цезарь с курицей</div>
                    </div>
                    <span class="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><span class="material-icons-round text-[14px]">autorenew</span></span>
                    <span class="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><span class="material-icons-round text-[16px]">add</span></span>
                  </div>
                </div>

                <div v-else-if="slide.id === 'catalog'" class="w-full max-w-[290px] rounded-2xl border border-slate-100 shadow-sm p-3">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="text-[13px] font-bold text-slate-900">Сырники</div>
                      <div class="text-[9px] text-slate-400">Завтрак · #Выходного дня</div>
                    </div>
                    <span class="text-[9px] font-black text-slate-900 bg-amber-100 rounded-lg px-1.5 py-1 leading-none">350 ккал<br><span class="font-semibold text-slate-500">на порцию</span></span>
                  </div>
                  <div class="mt-2 text-[9px] font-semibold text-slate-400">Рецепт даёт: <span class="text-slate-900">2 порции</span></div>
                  <div class="mt-1 space-y-0.5 text-[10px] text-slate-700">
                    <div class="flex justify-between"><span>Творог</span><span class="font-bold">400 г</span></div>
                    <div class="flex justify-between"><span>Яйцо куриное</span><span class="font-bold">1 шт</span></div>
                    <div class="flex justify-between"><span>Мука пшеничная</span><span class="font-bold">50 г</span></div>
                  </div>
                  <div class="mt-1.5 text-[8px] text-amber-600 font-semibold">↑ состав — на весь рецепт</div>
                </div>

                <div v-else-if="slide.id === 'portions'" class="w-full max-w-[290px] space-y-3">
                  <div class="flex items-center justify-between gap-1">
                    <div v-for="(d, i) in [{ day: 'Пн', state: 'готовим', used: 2 }, { day: 'Вт', state: 'доедаем', used: 4 }, { day: 'Ср', state: 'доедаем', used: 6 }]" :key="d.day" class="flex items-center gap-1">
                      <div class="rounded-xl border border-slate-100 shadow-sm px-2 py-1.5 text-center w-[76px]">
                        <div class="text-[8px] font-bold text-slate-400">{{ d.day }} · {{ d.state }}</div>
                        <div class="text-[11px] font-bold text-slate-900">Плов</div>
                        <div class="text-[8px] font-black text-slate-500">{{ d.used }}/6 порц.</div>
                      </div>
                      <span v-if="i < 2" class="material-icons-round text-slate-300 text-sm">arrow_forward</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-700">
                    <span class="material-icons-round text-[15px]">shopping_bag</span> продукты — на одну готовку
                  </div>
                  <div class="rounded-xl border border-slate-200 px-2.5 py-1.5 flex items-center gap-2">
                    <span class="flex-1 text-[10px] font-bold text-slate-700">Гречка отварная</span>
                    <span class="text-[10px] font-black text-slate-900 bg-slate-50 rounded px-1.5">− 2 +</span>
                    <span class="w-6 h-6 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center ring-2 ring-amber-300"><span class="material-icons-round text-[13px]">remove_shopping_cart</span></span>
                  </div>
                </div>

                <div v-else-if="slide.id === 'shopping'" class="w-full max-w-[290px] space-y-1.5">
                  <div class="flex items-center justify-between text-[9px] font-bold text-slate-500"><span>Куплено 3 из 8</span><span class="material-icons-round text-[14px] text-slate-700">content_copy</span></div>
                  <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full w-[38%] bg-slate-900 rounded-full"></div></div>
                  <div class="rounded-xl border border-slate-100 shadow-sm px-2.5 py-1.5 flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full border-2 border-slate-300"></span>
                    <div class="flex-1"><div class="text-[11px] font-bold text-slate-900">Куриное бедро</div><div class="text-[8px] text-slate-400">для: Плов, Бедро с луком</div></div>
                    <span class="text-[10px] font-black">1,2 кг</span>
                  </div>
                  <div class="rounded-xl border border-slate-100 shadow-sm px-2.5 py-1.5 flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full border-2 border-slate-300"></span>
                    <div class="flex-1 text-[11px] font-bold text-slate-900">Помидоры</div>
                    <span class="text-[10px] font-black">6 шт</span>
                  </div>
                  <div class="rounded-xl bg-slate-50 px-2.5 py-1.5 flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center"><span class="material-icons-round text-[11px]">check</span></span>
                    <div class="flex-1 text-[11px] font-bold text-slate-400 line-through">Творог</div>
                    <span class="text-[10px] font-black text-slate-400">400 г</span>
                  </div>
                </div>

                <div v-else-if="slide.id === 'family'" class="flex flex-col items-center gap-3">
                  <div class="rounded-2xl bg-slate-900 text-white px-5 py-2.5 text-center">
                    <div class="text-[8px] font-semibold text-white/60 mb-0.5">Код приглашения</div>
                    <div class="text-[22px] font-black tracking-[0.2em] leading-none">135 265</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm">🧑‍🍳</span>
                    <span class="material-icons-round text-slate-400 animate-spin" style="animation-duration: 3s">sync</span>
                    <span class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm">👩‍🍳</span>
                  </div>
                  <div class="text-[9px] font-semibold text-slate-400">общий план · общие блюда · общие покупки</div>
                </div>

                <div v-else class="flex flex-col items-center gap-2">
                  <div class="text-6xl">🎉</div>
                  <div class="text-[11px] font-semibold text-slate-400">приятного аппетита</div>
                </div>
              </div>

              <h2 class="text-[22px] font-black text-slate-900 leading-tight mt-6">{{ slide.title }}</h2>
              <p class="text-[13px] text-slate-500 leading-relaxed mt-2">{{ slide.lead }}</p>

              <div class="mt-4 space-y-3">
                <div v-for="p in slide.points" :key="p.text" class="flex items-start gap-3">
                  <span class="w-8 h-8 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center shrink-0">
                    <span class="material-icons-round text-[17px] text-slate-700">{{ p.icon }}</span>
                  </span>
                  <p class="text-[13px] text-slate-700 leading-snug pt-1.5">{{ p.text }}</p>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <div class="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] flex items-center gap-2">
          <Transition name="fade">
            <button v-if="index > 0" @click="go(index - 1)" class="w-12 h-12 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0 tap-effect" aria-label="Назад">
              <span class="material-icons-round">arrow_back</span>
            </button>
          </Transition>
          <button @click="nextOrClose" class="btn-primary flex-1 h-12 !py-0 text-sm flex items-center justify-center gap-1.5">
            {{ isLast ? 'Поехали!' : index === 0 ? 'Покажите, как всё устроено' : 'Дальше' }}
            <span v-if="!isLast" class="material-icons-round text-base">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
