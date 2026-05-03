-- CoHome backend uses PostgREST with the publishable (anon) key from the dashboard.
-- Without policies, RLS blocks all rows. These policies mirror prior "backend owns the DB" usage.
-- Tighten with Supabase Auth + service_role later for production.

DROP POLICY IF EXISTS "cohome_anon_all_users" ON public.users;
DROP POLICY IF EXISTS "cohome_anon_all_user_sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "cohome_anon_all_homes" ON public.homes;
DROP POLICY IF EXISTS "cohome_anon_all_devices" ON public.devices;
DROP POLICY IF EXISTS "cohome_anon_all_alerts" ON public.alerts;
DROP POLICY IF EXISTS "cohome_anon_all_solar_readings" ON public.solar_readings;

CREATE POLICY "cohome_anon_all_users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cohome_anon_all_user_sessions" ON public.user_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cohome_anon_all_homes" ON public.homes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cohome_anon_all_devices" ON public.devices FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cohome_anon_all_alerts" ON public.alerts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cohome_anon_all_solar_readings" ON public.solar_readings FOR ALL TO anon USING (true) WITH CHECK (true);
