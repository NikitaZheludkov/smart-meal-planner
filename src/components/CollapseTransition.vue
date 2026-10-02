<script setup>
// Плавное раскрытие/сворачивание блока по высоте (height: 0 ↔ auto),
// чтобы содержимое ниже не прыгало. Отступы блока (padding/margin) тоже
// анимируются, иначе в конце был бы рывок. Использование:
//   <CollapseTransition><div v-if="open">...</div></CollapseTransition>
// Для списка, где строки добавляются/удаляются: <CollapseTransition group tag="div">.
import { TransitionGroup, Transition } from 'vue'

const props = defineProps({
  group: Boolean,
  tag: { type: String, default: 'div' }
})
const BOX = ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom']
const CSS_NAMES = ['height', 'padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'opacity']
const TRANSITION = CSS_NAMES.map((p) => `${p} var(--dur-fast) var(--easing-base)`).join(', ')
const FALLBACK_MS = 450 // если transitionend не придёт (размер не изменился и т.п.)

const measure = (el) => {
  const cs = getComputedStyle(el)
  return {
    height: `${el.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom
  }
}
const apply = (el, values) => { for (const k of BOX) el.style[k] = values[k] }
const ZERO = Object.fromEntries(BOX.map((k) => [k, '0px']))

const waitEnd = (el, done) => {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    el.removeEventListener('transitionend', onEnd)
    done()
  }
  const onEnd = (e) => { if (e.target === el && e.propertyName === 'height') finish() }
  el.addEventListener('transitionend', onEnd)
  setTimeout(finish, FALLBACK_MS)
}

const cleanup = (el) => {
  el.style.transition = ''
  el.style.overflow = ''
  el.style.opacity = ''
  el.style.boxSizing = ''
  for (const k of BOX) el.style[k] = ''
}

const onEnter = (el, done) => {
  const target = measure(el)
  el.style.boxSizing = 'content-box'
  el.style.overflow = 'hidden'
  apply(el, ZERO)
  el.style.opacity = '0'
  void el.offsetHeight // фиксируем стартовое состояние
  el.style.transition = TRANSITION
  apply(el, target)
  el.style.opacity = '1'
  waitEnd(el, done)
}

const onLeave = (el, done) => {
  el.style.boxSizing = 'content-box'
  apply(el, measure(el))
  el.style.overflow = 'hidden'
  void el.offsetHeight
  el.style.transition = TRANSITION
  apply(el, ZERO)
  el.style.opacity = '0'
  waitEnd(el, done)
}
</script>

<template>
  <component
    :is="props.group ? TransitionGroup : Transition"
    v-bind="props.group ? { tag: props.tag } : {}"
    :css="false"
    @enter="onEnter" @after-enter="cleanup" @enter-cancelled="cleanup"
    @leave="onLeave" @leave-cancelled="cleanup"
  >
    <slot />
  </component>
</template>
