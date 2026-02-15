
-- Update sort order to place Garnish after Main dishes
-- Assuming standard order we want:
-- 1. Суп (Soup)
-- 2. Основное (Main)
-- 3. Гарнир (Garnish)
-- 4. Салат (Salad)
-- ...

-- We use specific names.
-- It seems previous update might not have taken effect if names didn't match exactly (case sensitivity) 
-- or if there was an error I missed.

-- Let's try to be more robust with ILIKE or standardizing names.
-- Also let's set them explicitly again.

UPDATE dish_types SET sort_order = 10 WHERE name ILIKE 'Суп%';
UPDATE dish_types SET sort_order = 20 WHERE name ILIKE 'Основн%';
UPDATE dish_types SET sort_order = 30 WHERE name ILIKE 'Гарнир%';
UPDATE dish_types SET sort_order = 40 WHERE name ILIKE 'Салат%';
UPDATE dish_types SET sort_order = 50 WHERE name ILIKE 'Завтрак%';
UPDATE dish_types SET sort_order = 60 WHERE name ILIKE 'Десерт%';
UPDATE dish_types SET sort_order = 70 WHERE name ILIKE 'Выпечк%';
UPDATE dish_types SET sort_order = 80 WHERE name ILIKE 'Закуск%';
UPDATE dish_types SET sort_order = 90 WHERE name ILIKE 'Напиток%';
UPDATE dish_types SET sort_order = 100 WHERE name ILIKE 'Соус%';
UPDATE dish_types SET sort_order = 999 WHERE name ILIKE 'Другое%';

-- Force cache reload just in case
NOTIFY pgrst, 'reload config';
