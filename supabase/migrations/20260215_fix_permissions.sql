
-- Grant permissions for the new table
ALTER TABLE dish_meal_type_links ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Enable read access for all users" ON dish_meal_type_links
    FOR SELECT USING (true);

-- Allow insert/update/delete for authenticated users (or restrict based on household logic if needed)
-- For now, consistent with other tables like dishes/ingredients if they are open to auth users
CREATE POLICY "Enable insert for authenticated users" ON dish_meal_type_links
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON dish_meal_type_links
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON dish_meal_type_links
    FOR DELETE USING (auth.role() = 'authenticated');

-- Explicitly grant usage on the table to the anon and authenticated roles if needed, 
-- though usually RLS policies are enough if the role has table access.
GRANT ALL ON dish_meal_type_links TO authenticated;
GRANT ALL ON dish_meal_type_links TO service_role;
