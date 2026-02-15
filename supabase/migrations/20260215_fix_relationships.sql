
-- Drop the table if it exists to allow recreation with named constraints if needed, 
-- but since we already have data, let's just ALTER to add named constraints if they are missing,
-- or just rely on the fact that Supabase refreshes schema cache.

-- However, the user is getting an error about the relationship not being found even with the hint.
-- The most robust way often is just to rely on the default relationship detection if there is only one FK.
-- But since the previous attempt failed even with a hint (or maybe because the hint was wrong),
-- let's try to reload the schema cache or just use the simple query again, assuming the cache might have been stale.

-- Actually, the error "Could not find a relationship... in the schema cache" strongly suggests 
-- that the Supabase PostgREST schema cache hasn't updated yet.

-- We can try to force a schema cache reload by running a dummy NOTIFY or just waiting, 
-- but from the code side, removing the incorrect hint is the first step.
-- The previous error said "Searched ... using the hint ... but no matches were found". 
-- This implies the hint MIGHT be wrong or the relationship isn't there.
-- Since I created the table with `REFERENCES dishes(id)`, the FK exists.
-- Postgres auto-names FKs if not specified, usually `table_column_fkey`.
-- So for `dish_meal_type_links` column `dish_id`, it should be `dish_meal_type_links_dish_id_fkey`.

-- Let's explicitly name the constraint to be 100% sure if we need to use a hint, 
-- OR just trust the automatic detection without the hint now that we've checked the creation SQL.
-- The creation SQL did NOT specify a name: `dish_id uuid REFERENCES dishes(id)`.
-- So it defaults to `dish_meal_type_links_dish_id_fkey`.

-- Why did it fail? Maybe schema cache.
-- Let's try to remove the hint first (revert to simple join) as often that works if there's only one path.

-- To be safe, I will create a migration that explicitly adds the constraint with a known name
-- just in case the auto-generated name was different (e.g. truncated).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dish_meal_type_links_dish_id_fkey'
    ) THEN
        ALTER TABLE dish_meal_type_links
        DROP CONSTRAINT IF EXISTS dish_meal_type_links_dish_id_fkey;
        
        ALTER TABLE dish_meal_type_links
        ADD CONSTRAINT dish_meal_type_links_dish_id_fkey
        FOREIGN KEY (dish_id)
        REFERENCES dishes(id)
        ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dish_meal_type_links_meal_type_id_fkey'
    ) THEN
        ALTER TABLE dish_meal_type_links
        DROP CONSTRAINT IF EXISTS dish_meal_type_links_meal_type_id_fkey;

        ALTER TABLE dish_meal_type_links
        ADD CONSTRAINT dish_meal_type_links_meal_type_id_fkey
        FOREIGN KEY (meal_type_id)
        REFERENCES meal_types(id)
        ON DELETE CASCADE;
    END IF;
END $$;

NOTIFY pgrst, 'reload config';
