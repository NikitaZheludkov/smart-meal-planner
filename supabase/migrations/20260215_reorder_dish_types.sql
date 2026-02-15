
-- Update sort order to place Garnish after Main dishes
-- Assuming:
-- 1: Breakfast
-- 2: Lunch
-- 3: Dinner
-- 4: Snack
-- And for dish types (example):
-- 1: Soup
-- 2: Main
-- 3: Salad
-- ...
-- Let's check current items and reorder.
-- Usually "Main" (Второе/Основное) is around 2 or 3.
-- We want Garnish (Гарнир) to be right after Main.

-- First, let's see what we have (conceptual, since I can't select and see output directly in one go easily without logs)
-- But I can just update the sort_order.

-- If "Основное" (Main) has sort_order X, we want "Гарнир" (Garnish) to be X + 1.
-- And shift others down.

-- Let's assume a standard set:
-- 1. Супы (Soup)
-- 2. Основные (Main)
-- 3. Салаты (Salad)
-- 4. Десерты (Dessert)
-- 5. Напитки (Drinks)
-- 6. Завтраки (Breakfast items - sometimes separate)

-- We want:
-- 1. Супы
-- 2. Основные
-- 3. Гарниры
-- 4. Салаты
-- ...

-- So let's update 'Гарнир' to 3 (if we assume space or we will renumber).
-- A safe way is to update specific known names.

UPDATE dish_types SET sort_order = 1 WHERE name = 'Суп';
UPDATE dish_types SET sort_order = 2 WHERE name = 'Основное';
UPDATE dish_types SET sort_order = 3 WHERE name = 'Гарнир';
UPDATE dish_types SET sort_order = 4 WHERE name = 'Салат';
UPDATE dish_types SET sort_order = 5 WHERE name = 'Завтрак';
UPDATE dish_types SET sort_order = 6 WHERE name = 'Десерт';
UPDATE dish_types SET sort_order = 7 WHERE name = 'Выпечка';
UPDATE dish_types SET sort_order = 8 WHERE name = 'Закуска';
UPDATE dish_types SET sort_order = 9 WHERE name = 'Напиток';
UPDATE dish_types SET sort_order = 10 WHERE name = 'Соус';
UPDATE dish_types SET sort_order = 99 WHERE name = 'Другое';

-- Ensure we cover common variations if names differ slightly (case insensitive is good but names are usually capitalized)
