-- 1. Rename duplicate products to allow unique index creation
DO $$
DECLARE
    r RECORD;
    i INT;
BEGIN
    -- Find duplicates by household and lower(name)
    FOR r IN 
        SELECT household_id, lower(name) as lname, array_agg(id ORDER BY created_at) as ids
        FROM products
        GROUP BY household_id, lower(name)
        HAVING count(*) > 1
    LOOP
        -- Skip the first one (keep as original), rename the rest
        FOR i IN 2 .. array_length(r.ids, 1) LOOP
            UPDATE products 
            SET name = name || ' (дубликат ' || (i-1)::text || ')' 
            WHERE id = r.ids[i];
        END LOOP;
    END LOOP;
END $$;

-- 2. Rename duplicate dishes to allow unique index creation
DO $$
DECLARE
    r RECORD;
    i INT;
BEGIN
    -- Find duplicates by household and lower(name)
    FOR r IN 
        SELECT household_id, lower(name) as lname, array_agg(id ORDER BY created_at) as ids
        FROM dishes
        GROUP BY household_id, lower(name)
        HAVING count(*) > 1
    LOOP
        -- Skip the first one (keep as original), rename the rest
        FOR i IN 2 .. array_length(r.ids, 1) LOOP
            UPDATE dishes 
            SET name = name || ' (дубликат ' || (i-1)::text || ')' 
            WHERE id = r.ids[i];
        END LOOP;
    END LOOP;
END $$;

-- 3. Add unique constraint to dishes table
CREATE UNIQUE INDEX IF NOT EXISTS unique_dish_name_per_household 
ON dishes (household_id, lower(name));

-- 4. Add unique constraint to products table
CREATE UNIQUE INDEX IF NOT EXISTS unique_product_name_per_household 
ON products (household_id, lower(name));
