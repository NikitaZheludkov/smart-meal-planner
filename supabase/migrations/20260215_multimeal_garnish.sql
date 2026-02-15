-- 1. Add "Garnish" (Гарнир) to dish_types
-- We assume UUIDs are auto-generated or handled. We'll let Postgres generate ID.
INSERT INTO dish_types (name, sort_order)
SELECT 'Гарнир', 5
WHERE NOT EXISTS (
    SELECT 1 FROM dish_types WHERE name = 'Гарнир'
);

-- 2. Create Many-to-Many table for dishes <-> meal_types
CREATE TABLE IF NOT EXISTS dish_meal_type_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    dish_id uuid REFERENCES dishes(id) ON DELETE CASCADE,
    meal_type_id uuid REFERENCES meal_types(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dish_id, meal_type_id)
);

-- 3. Migrate existing data from the single column to the link table
INSERT INTO dish_meal_type_links (dish_id, meal_type_id)
SELECT id, meal_type_id 
FROM dishes 
WHERE meal_type_id IS NOT NULL
ON CONFLICT (dish_id, meal_type_id) DO NOTHING;

-- 4. (Optional) We keep the old column for now to prevent immediate errors during transition, 
-- but we will update the code to ignore it.
