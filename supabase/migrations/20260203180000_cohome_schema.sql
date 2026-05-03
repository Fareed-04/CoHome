-- CoHome relational schema for Supabase (PostgreSQL).
-- Deploy: paste in SQL Editor, or run `supabase db push` / `supabase migration up`.

CREATE TABLE IF NOT EXISTS public.users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  subscription TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions (user_id);

CREATE TABLE IF NOT EXISTS public.homes (
  home_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  member_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homes_owner_id ON public.homes (owner_id);

CREATE TABLE IF NOT EXISTS public.devices (
  device_id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES public.homes (home_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  is_on BOOLEAN NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_home_id ON public.devices (home_id);
CREATE INDEX IF NOT EXISTS idx_devices_type ON public.devices (type);

CREATE TABLE IF NOT EXISTS public.alerts (
  alert_id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES public.homes (home_id) ON DELETE CASCADE,
  device_id TEXT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_home_id ON public.alerts (home_id);

CREATE TABLE IF NOT EXISTS public.solar_readings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES public.devices (device_id) ON DELETE CASCADE,
  "timestamp" TIMESTAMPTZ NOT NULL,
  current_power_w DOUBLE PRECISION,
  today_energy_kwh DOUBLE PRECISION,
  total_energy_kwh DOUBLE PRECISION,
  grid_voltage_v DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION,
  pv_strings JSONB,
  is_online BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_solar_readings_device_timestamp
  ON public.solar_readings (device_id, "timestamp" DESC);

-- Faster JSON lookups for polling (devices with solar + connection_config in settings).
CREATE INDEX IF NOT EXISTS idx_devices_settings_gin ON public.devices USING gin (settings);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solar_readings ENABLE ROW LEVEL SECURITY;

-- CoHome talks to Postgres via the backend using the DB service role URI (secret).
-- RLS stays on but does not restrict the service_role key. Optionally add policies later for direct client access.
