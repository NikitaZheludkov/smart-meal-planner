
-- Миграция: Добавление индексов производительности
-- Дата: 2024-02-14
-- Автор: Trae AI

-- 1. Индексы для внешних ключей (Foreign Keys)
-- Ускоряют JOIN операции и каскадное удаление
CREATE INDEX IF NOT EXISTS idx_dishes_household_id ON public.dishes(household_id);
CREATE INDEX IF NOT EXISTS idx_products_household_id ON public.products(household_id);
CREATE INDEX IF NOT EXISTS idx_plan_household_id ON public.plan(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_cart_household_id ON public.shopping_cart(household_id);
CREATE INDEX IF NOT EXISTS idx_profiles_household_id ON public.profiles(household_id);

-- 2. Индексы для связей "Многие-ко-многим" и вложенных структур
CREATE INDEX IF NOT EXISTS idx_ingredients_dish_id ON public.ingredients(dish_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_product_id ON public.ingredients(product_id);

-- 3. Композитные индексы для частых запросов
-- Ускоряет поиск плана на конкретную дату (самый частый запрос в приложении)
CREATE INDEX IF NOT EXISTS idx_plan_household_date ON public.plan(household_id, date);

-- Ускоряет проверку корзины (поиск конкретного товара в корзине семьи)
CREATE INDEX IF NOT EXISTS idx_shopping_cart_lookup ON public.shopping_cart(household_id, product_id);

-- 4. Индексы для сортировки (если часто используется сортировка по имени)
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_dishes_name ON public.dishes(name);

COMMENT ON INDEX idx_plan_household_date IS 'Ускоряет выборку плана питания на неделю';
