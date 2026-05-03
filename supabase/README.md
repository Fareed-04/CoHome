# CoHome Supabase / Postgres migrations

Run in this order:

1. `migrations/20260203180000_cohome_schema.sql` — users, sessions, homes, devices, alerts, solar_readings.
2. `migrations/20260203180001_seed_user_fareed.sql` — adds **fareed2004@gmail.com** with password **12345678** if that email is not already present.
3. `migrations/20260204120002_cohome_anon_api_policies.sql` — RLS policies so the **publishable (anon) API key** can read/write via PostgREST (required for the FastAPI backend using `/rest/v1`).

Apply via **Supabase Dashboard → SQL Editor** (paste each file), or **`supabase db push`** after `supabase link`.

The backend connects with **`REACT_APP_SUPABASE_URL`** and **`REACT_APP_SUPABASE_PUBLISHABLE_KEY`** (see repo `README`).
