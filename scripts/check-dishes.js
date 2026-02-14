
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wwvrgffgtqqxupqvnpzc.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3dnJnZmZndHFxeHVwcXZucHpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzY5MDQwMCwiZXhwIjoyMDgzMjY2NDAwfQ.V6wWSqvOiHl3ankIcg1AwTHyb9hN2SRqKCy5TuQ-PgI'

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function getDishes() {
  console.log('Fetching dishes from database...')
  
  const { data: dishes, error } = await supabase
    .from('dishes')
    .select(`
      name,
      kcal,
      protein,
      fat,
      carbs,
      ingredients (
        amount,
        products (
          name,
          unit
        )
      )
    `)
    .limit(5)

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (dishes.length === 0) {
    console.log('No dishes found in the database.')
    return
  }

  console.log(`\nFound ${dishes.length} dishes:\n`)
  
  dishes.forEach((dish, index) => {
    console.log(`${index + 1}. ${dish.name}`)
    console.log(`   KBJU: ${dish.kcal} kcal | P: ${dish.protein}g | F: ${dish.fat}g | C: ${dish.carbs}g`)
    
    if (dish.ingredients && dish.ingredients.length > 0) {
      console.log('   Ingredients:')
      dish.ingredients.forEach(ing => {
        if (ing.products) {
          console.log(`   - ${ing.products.name}: ${ing.amount} ${ing.products.unit || ''}`)
        }
      })
    } else {
      console.log('   (No ingredients listed)')
    }
    console.log('') // Empty line separator
  })
}

getDishes()
