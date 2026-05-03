# CoHome

CoHome is a smart-home style dashboard: homes, devices (solar, cameras, doors, climate, and more), alerts, family members, and optional **real solar inverter integrations** (Growatt, GoodWe, Fronius, Solis, manual entry, and others). The stack is a **FastAPI** backend that talks to **Supabase PostgREST** (`/rest/v1`) with the **publishable API key**, plus a **React** single-page app (Create React App + Craco + Tailwind).

## Repository layout

| Path | Role |
|------|------|
| `backend/` | FastAPI app (`server.py`), solar adapters (`solar_service.py`), API under `/api/*` |
| `frontend/` | React UI; calls the backend via `REACT_APP_BACKEND_URL` |

## Prerequisites

- **Python** 3.10+ (recommended for FastAPI, Pydantic v2, and dependencies)
- **Node.js** 18+ and **Yarn** or **npm** (see `frontend/.npmrc` if using npm with legacy peer deps)
- A **[Supabase](https://supabase.com)** project (or any Postgres 14+ URL you manage yourself)

## 1. Supabase database and migrations

1. Create a project at [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run these files **in order**:
   - [`supabase/migrations/20260203180000_cohome_schema.sql`](supabase/migrations/20260203180000_cohome_schema.sql) — tables, indexes, RLS enabled.
   - [`supabase/migrations/20260203180001_seed_user_fareed.sql`](supabase/migrations/20260203180001_seed_user_fareed.sql) — seed user **fareed2004@gmail.com** / password **12345678** (only if that email does not exist).
   - [`supabase/migrations/20260204120002_cohome_anon_api_policies.sql`](supabase/migrations/20260204120002_cohome_anon_api_policies.sql) — **required**: RLS policies so the **publishable (anon)** key can use PostgREST (same key as in the React snippet).

Details: [`supabase/README.md`](supabase/README.md).

Alternatively, with [Supabase CLI](https://supabase.com/docs/guides/cli): link the project and run `supabase db push`.

## 2. Backend

### Environment

Edit `backend/.env` (loaded via `python-dotenv`). Optional `backend/.env.local` overrides it.

**Required for the API:** the same values as in the Supabase “React” / app snippet (Project **API URL** and **publishable** key). You can use either name:

```env
REACT_APP_SUPABASE_URL=https://YOUR_REF.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Or the canonical names (the backend also copies `REACT_APP_*` → these on startup):

```env
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_ANON_KEY=your_publishable_key
```

There is **no** direct Postgres `DATABASE_URL` / pooler for the backend anymore: all persistence goes through **`/rest/v1`**.

The **publishable key is public** by design; the anon RLS policies in migration `20260204120002` allow full table access for local/dev. Tighten policies or switch to **service_role** on the server before a production deployment.

```env
CORS_ORIGINS=http://localhost:3000
# ENCRYPTION_KEY=
# COOKIE_SECURE=false
```

### Install and run

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment (Windows PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the API with Uvicorn (default port **8000**):

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

- Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- API routes are prefixed with **`/api`** (for example `POST /api/auth/login`).

The server starts a background task that polls connected solar devices about every five minutes.

## 3. Frontend

### Environment

The repo includes **`frontend/.env.development`** with `REACT_APP_BACKEND_URL=http://localhost:8000`. You can override locally with **`frontend/.env.development.local`** or **`frontend/.env.local`**.

**`frontend/src/supabaseClient.js`** exposes `createClient` when Supabase URL + key are set (optional until you use Auth / PostgREST from the browser).

```env
REACT_APP_BACKEND_URL=http://localhost:8000
REACT_APP_SUPABASE_URL=https://YOUR_REF.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

Do not add a trailing slash. All API calls use `${REACT_APP_BACKEND_URL}/api`. If this variable is missing, the app calls `undefined/api` and auth will fail.

### Install and run

```bash
cd frontend
yarn install
yarn start
```

The dev server defaults to [http://localhost:3000](http://localhost:3000). Scripts use **Craco** (`craco start` / `craco build`), not the raw `react-scripts` CLI name.

Production build:

```bash
yarn build
```

Serve the `frontend/build` folder with any static host; set `REACT_APP_BACKEND_URL` at build time to your public API origin.

## 4. Running the full app

1. Apply Supabase migrations (section 1), including the **anon API policies** migration.
2. Set **`REACT_APP_SUPABASE_URL`** and **`REACT_APP_SUPABASE_PUBLISHABLE_KEY`** in `backend/.env` or `.env.local`.
2. Start the backend (`uvicorn` on port 8000).
3. Start the frontend (`npm start` or `yarn start` on port 3000).
4. Open [http://localhost:3000](http://localhost:3000).

Authentication uses **HTTP-only session cookies** (`withCredentials: true`) plus email/password or **Google sign-in** (redirects through `https://auth.emergentagent.com/` and exchanges the session with the backend). For Google OAuth to work end-to-end, your deployed or tunneled URLs must match how that auth service is configured.

### CORS and cookies

Set `CORS_ORIGINS` to your frontend origin (e.g. `http://localhost:3000`). With `COOKIE_SECURE=false` (the default), the API uses **`SameSite=Lax`** and **non-Secure** cookies so **`http://localhost`** dev works reliably across ports **3000** and **8000**. Deployed HTTPS frontends/APIs that are cross-site should set **`COOKIE_SECURE=true`** so cookies use `SameSite=None; Secure`.

Do not use `CORS_ORIGINS=*` together with credential cookies — browsers block that combination.

## 5. Tests (optional)

Backend integration tests under `backend/tests/` expect a running API. Set the same base URL you use in the frontend:

```bash
# Windows PowerShell
$env:REACT_APP_BACKEND_URL="http://localhost:8000"
cd backend
pytest
```

The included tests assume existing data (see `test_cohome_api.py` for fixture emails and IDs); they are most useful against a configured test environment.

## Tech summary

- **Backend:** FastAPI, **Supabase PostgREST** (`requests` + publishable key), bcrypt sessions, optional solar vendor APIs via `solar_service.py`
- **Frontend:** React 19, React Router 7, Axios, **@supabase/supabase-js** (optional client in `src/supabaseClient.js`), Radix UI, Tailwind, Recharts

Integration tests under `backend/tests/` still expect a reachable API (`REACT_APP_BACKEND_URL`); they do not migrate data from Emergent-hosted MongoDB—use dumps or manually recreate users/homes after switching DBs.
