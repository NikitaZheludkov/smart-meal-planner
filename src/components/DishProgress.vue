<script setup>
import { computed } from 'vue'
import { useShoppingStore } from '../stores/shopping'

const props = defineProps({
  dishes: { type: Array, default: () => [] }
})

const shoppingStore = useShoppingStore()

const dishesWithProgress = computed(() => {
    const groups = {}

    props.dishes.forEach(planItem => {
        const dish = planItem.dishes
        // Пропускаем, если нет ингредиентов
        if (!dish || !dish.ingredients || dish.ingredients.length === 0) return

        // Если встречаем блюдо ВПЕРВЫЕ — инициализируем и считаем ингредиенты по рецепту
        if (!groups[dish.id]) {
            
            // 1. Считаем, сколько всего уникальных ингредиентов в рецепте
            const recipeTotal = dish.ingredients.length
            
            // 2. Считаем, сколько из них отмечено галочками
            const recipeBought = dish.ingredients.reduce((acc, ing) => {
                return acc + (shoppingStore.isChecked(ing.product_id) ? 1 : 0)
            }, 0)

            groups[dish.id] = {
                id: dish.id,
                name: dish.name,
                count: 0,       // Счетчик количества раз в плане
                total: recipeTotal,
                bought: recipeBought
            }
        }

        // Просто увеличиваем счетчик "сколько раз готовим"
        groups[dish.id].count++
        
        // ВАЖНО: Мы больше НЕ суммируем total и bought здесь,
        // так как рецепт один и тот же.
    })

    return Object.values(groups).map(item => {
        const percent = item.total > 0 ? Math.round((item.bought / item.total) * 100) : 0
        
        return {
            ...item,
            percent,
            isReady: percent === 100
        }
    })
})
</script>

<template>
  <div v-if="dishesWithProgress.length > 0" class="mb-6 animate-fade-in">
      <h3 class="font-black text-slate-300 text-xs mb-3 pl-2">Готовность блюд</h3>
      
      <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
          <div 
            v-for="item in dishesWithProgress" 
            :key="item.id"
            class="min-w-[140px] max-w-[140px] bg-white rounded-2xl p-3 border shadow-sm flex flex-col justify-between transition-all duration-300"
            :class="item.isReady ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100'"
          >
              <div class="mb-2">
                  <div class="font-bold text-slate-800 text-xs leading-tight line-clamp-2 mb-1 h-8" :title="item.name">
                      {{ item.name }}
                      <span v-if="item.count > 1" class="text-indigo-500 ml-0.5">x{{ item.count }}</span>
                  </div>
                  
                  <div class="text-[10px] font-bold transition-colors" :class="item.isReady ? 'text-emerald-600' : 'text-slate-400'">
                      {{ item.isReady ? 'Все продукты есть!' : `${item.bought} из ${item.total}` }}
                  </div>
              </div>

              <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    class="h-full rounded-full transition-all duration-500 ease-out"
                    :class="item.isReady ? 'bg-emerald-500' : 'bg-indigo-500'"
                    :style="{ width: item.percent + '%' }"
                  ></div>
              </div>
          </div>
      </div>
  </div>
</template>

<style scoped>
/* animate-fade-in is now global in style.css */
</style>