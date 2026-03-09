# Cohome - Smart Home IoT SaaS Platform
## Product Requirements Document

**Last Updated:** March 2026  
**Status:** MVP Complete

---

## Problem Statement
Build a unified Smart Home IoT SaaS platform for Pakistani homeowners to manage all home devices (solar, cameras, doors, geyser, doorbell) from one beautiful, secure application. Launchable as a startup targeting the Pakistani market.

---

## Target Audience
- Pakistani homeowners with smart home devices
- Tech-savvy families managing multiple properties
- Early adopters seeking a unified home automation solution

---

## User Personas
1. **Ahmed (Primary)** - Karachi homeowner, has solar panels, cameras, smart gate. Uses 3 apps currently.
2. **Fatima (Family)** - Wife of Ahmed, needs read-only access to monitor the home remotely.
3. **Real Estate Owner** - Manages 3+ properties, needs multi-home dashboard.

---

## Architecture

### Tech Stack
- **Frontend:** React 19, TailwindCSS, Recharts, Lucide React, React Router v7
- **Backend:** FastAPI, Motor (async MongoDB), Bcrypt, Emergent Auth
- **Database:** MongoDB (local via MONGO_URL env var)
- **Auth:** JWT session tokens (stored in MongoDB) + Emergent Google OAuth

### Key Design Patterns
- Session tokens stored in `user_sessions` collection (not JWT-based)
- Cookie-based auth (`session_token` httpOnly cookie) + Bearer token fallback
- All MongoDB queries use `{"_id": 0}` projection
- Custom `user_id` field (UUID-based, not MongoDB's `_id`)
- Device seeding on home creation (7 devices auto-created)

---

## Core Requirements (Static)

### Authentication
- [x] Email/password registration and login
- [x] Google OAuth via Emergent Auth
- [x] Secure session tokens (7-day expiry, httpOnly cookies)
- [x] Protected routes with auth checking

### Device Management
- [x] Solar Panel monitoring (battery %, kWh, savings)
- [x] Security Cameras (feed placeholder, motion detection toggle)
- [x] Smart Doors & Gates (lock/unlock control)
- [x] Doorbell (enable/disable, ring history - MOCKED)
- [x] Geyser (temperature control, scheduling)
- [x] Device toggle (on/off) for all devices
- [x] Auto-seed 7 devices on home creation

### Multi-Home Support
- [x] Create/edit/delete multiple homes
- [x] Home selector in header
- [x] Per-home device management
- [x] Per-home alerts

### Family Access
- [x] Invite members by email
- [x] Role-based access (owner/admin/member)
- [x] Remove members

### Analytics
- [x] Solar energy chart (24h/7d/30d periods)
- [x] Energy generation vs consumption
- [x] Battery level progress bar
- [x] Monthly savings in PKR

### Subscription
- [x] Free plan (1 home, 5 devices, 2 family members)
- [x] Pro plan (unlimited everything)
- [x] Upgrade flow (mock - payment not yet integrated)

---

## What's Been Implemented

### Backend (server.py)
| Date | Feature |
|------|---------|
| Mar 2026 | Auth routes: register, login, google/session, me, logout |
| Mar 2026 | Homes CRUD: create, read, update, delete |
| Mar 2026 | Devices CRUD + toggle + settings update + analytics |
| Mar 2026 | Auto-seed 7 devices on home creation |
| Mar 2026 | Alerts: list, mark read, mark all read, delete |
| Mar 2026 | Family members: add, list, remove |
| Mar 2026 | Home stats endpoint (total/online/active devices, solar data) |
| Mar 2026 | Subscription: get plan, upgrade to pro |
| Mar 2026 | Solar analytics generator (24h/7d/30d mock data) |

### What's Been Implemented (continued)

| Date | Feature |
|------|---------|
| Mar 2026 | Solar inverter connection wizard (4-step modal) |
| Mar 2026 | GoodWe SEMS Portal full integration (login → stations → live data) |
| Mar 2026 | Fronius Local API integration (LAN direct, <100ms) |
| Mar 2026 | Manual entry mode (any brand) |
| Mar 2026 | Credential encryption with Fernet AES-256 |
| Mar 2026 | Background polling every 5 minutes (asyncio) |
| Mar 2026 | Solar readings stored in MongoDB (solar_readings collection) |
| Mar 2026 | Live solar dashboard: kW, kWh, PKR savings, grid voltage, temp, PV strings |
| Mar 2026 | Coming-soon brands: Huawei, Growatt, Sungrow, Solis, SMA, Inverex (credentials saved) |
| Page | Route | Status |
|------|-------|--------|
| Landing | / | ✅ |
| Login/Register | /login, /register | ✅ |
| Auth Callback | (hash-based) | ✅ |
| Dashboard | /dashboard | ✅ |
| Solar Monitor | /solar | ✅ |
| Security | /security | ✅ |
| Climate/Geyser | /climate | ✅ |
| Doorbell | /doorbell | ✅ |
| Homes | /homes | ✅ |
| Family | /family | ✅ |
| Settings | /settings | ✅ |
| Subscription | /subscription | ✅ |
| Alerts | /alerts | ✅ |

---

## Mocked / Placeholder Features
- **Camera live feeds:** Placeholder UI (requires IoT hardware integration)
- **Doorbell ring history:** 5 hardcoded events in frontend (need real IoT push)
- **Solar analytics:** Random time-series generation (need real sensor data)
- **Subscription payment:** Free upgrade (Stripe not yet integrated)
- **Real-time updates:** No WebSocket yet (polling on page load)

---

## Prioritized Backlog

### P0 - Critical for Launch
- [ ] Real IoT device connectivity (MQTT/WebSocket)
- [ ] Stripe payment integration for Pro subscriptions
- [ ] Email notifications for alerts
- [ ] Push notifications (FCM)

### P1 - Important
- [ ] Real-time dashboard updates (WebSockets)
- [ ] Device automation rules (IF door opened THEN alert)
- [ ] Historical data export (CSV/PDF)
- [ ] Mobile app (React Native)
- [ ] User profile photo upload
- [ ] Password change endpoint

### P2 - Nice to Have
- [ ] Dark mode
- [ ] Multiple language support (Urdu)
- [ ] Energy usage reports (weekly/monthly PDF)
- [ ] Geofencing (auto-lock when leaving home)
- [ ] Smart energy scheduling (use solar when available)
- [ ] Admin panel for SaaS management

---

## Changelog

| Date | Fix |
|------|-----|
| Mar 2026 | Fixed GoodWe SEMS login: `/v1/` → `/v2/Common/CrossLogin` (v1 was deprecated) |
| Mar 2026 | Fixed station data endpoint: `/v3/` → `/v2/PowerStation/GetMonitorDetailByPowerstationId` |
| Mar 2026 | Removed `GetPowerStationList` call (restricted to enterprise NDA accounts only) |
| Mar 2026 | Implemented Growatt ShineMonitor adapter (growattServer library) |
| Mar 2026 | Implemented Solis SolisCloud adapter (HMAC-SHA256 auth) |
| Mar 2026 | Implemented Inverex (Growatt-based) and Inverex (Solis-based) adapters |
| Mar 2026 | Huawei / Sungrow / SMA show "Partner API Required" guide with correct contact info |
| Mar 2026 | Fixed brand-switching caching bug — old data cleared when user changes inverter brand |
| Mar 2026 | Fixed double-render bug in ConnectSolarModal brand grid |
| Mar 2026 | Fixed Growatt PV string parser (removed unreliable dir() checks) |
| Mar 2026 | Fixed disconnect endpoint — now clears all stale cached fields |
| Mar 2026 | Removed fake Consumption line from chart (not available from SEMS API) |
| Mar 2026 | 24h chart shows average kW per hour from stored readings; 7d/30d shows daily generation totals |
| Mar 2026 | Improved error handling: SEMS-specific errors shown in UI |

## Next Tasks (Immediate)
1. User to test GoodWe connection with real credentials
2. Implement other solar inverter APIs (Huawei FusionSolar, Growatt ShineMonitor)
3. Add real-time device state sync via WebSocket
4. Integrate Stripe for subscription payments
5. Set up email alerting (SendGrid/Resend)
