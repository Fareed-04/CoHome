from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import math
import secrets
import uuid
import bcrypt
import requests as req_lib
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from pg_store import (
    init_pg_pool,
    close_pg_pool,
    pg_pool,
    session_find_by_token,
    user_find_by_id,
    session_insert,
    session_delete_by_token,
    home_ids_for_user,
    homes_list_for_user,
    home_find_for_member,
    home_find_owned,
    home_insert,
    home_update_fields,
    home_delete,
    home_patch_members_add,
    home_patch_members_remove,
    home_by_id,
    devices_insert_many,
    devices_list_by_home,
    device_find,
    device_find_solar,
    device_insert_one,
    device_drop_settings_keys,
    device_settings_merge_nested,
    device_delete,
    device_set_field,
    device_set_status,
    alerts_list_for_homes,
    alerts_list_home,
    alert_find,
    alert_mark_read,
    alerts_mark_all_read,
    alert_delete,
    alert_insert,
    alerts_count_unread,
    solar_readings_since_select,
    solar_readings_list,
    solar_reading_insert,
    user_find_by_email,
    user_insert,
    user_update_google_profile,
    user_set_subscription,
    devices_find_solar_with_connection,
)
from solar_service import (
    test_connection_sync, fetch_solar_live_data,
    encrypt_credential, decrypt_credential
)
from supabase_env import apply_supabase_env_aliases

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
# Local overrides (same idea as CRA `.env.local`); `DATABASE_*` and secrets often live here.
load_dotenv(ROOT_DIR / ".env.local", override=True)
apply_supabase_env_aliases()

# Keys removed under device.settings before reconnecting solar (Mongo $unset equivalents)
_SOLAR_STALE_FIELDS = [
    "current_power_w",
    "today_generation_kwh",
    "total_energy_kwh",
    "grid_voltage_v",
    "grid_frequency_hz",
    "temperature_c",
    "pv_strings",
    "capacity_kw",
    "inverter_model",
    "inverter_sn",
    "monthly_savings_pkr",
    "last_sync",
    "last_sync_error",
    "battery_soc",
    "grid_import_w",
    "grid_export_w",
]

_SOLAR_DISCONNECT_FIELDS = _SOLAR_STALE_FIELDS + [
    "connection_config",
    "connection_brand",
    "connection_status",
]

app = FastAPI()
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def _env_bool(key: str, default: str = "false") -> bool:
    return os.environ.get(key, default).lower() in ("1", "true", "yes")


# SameSite=None + Secure breaks local http:// dev (cookies are dropped). Use defaults for localhost;
# set COOKIE_SECURE=true behind HTTPS when frontend and API are on different HTTPS sites.
_COOKIE_SECURE = _env_bool("COOKIE_SECURE", "false")
_COOKIE_SAMESITE = "none" if _COOKIE_SECURE else "lax"

# ===================== HELPERS =====================

def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await session_find_by_token(pg_pool(), token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await user_find_by_id(pg_pool(), session["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await session_insert(pg_pool(), token, user_id, now + timedelta(days=7), now)
    return token

def make_session_response(data: dict, token: str) -> JSONResponse:
    resp = JSONResponse(content=data)
    resp.set_cookie(
        key="session_token",
        value=token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        path="/",
    )
    return resp

async def get_user_home_ids(user_id: str) -> List[str]:
    return await home_ids_for_user(pg_pool(), user_id)

async def seed_home_devices(home_id: str, owner_id: str):
    now = datetime.now(timezone.utc).isoformat()
    devices = [
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Solar Array", "type": "solar", "status": "online", "is_on": True,
         "settings": {"panel_count": 12, "capacity_kw": 5.4, "battery_percentage": 78,
                      "today_generation_kwh": 18.6, "monthly_savings_pkr": 4200}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Front Camera", "type": "camera", "status": "online", "is_on": True,
         "settings": {"resolution": "1080p", "night_vision": True, "motion_detection": True,
                      "recording_mode": "motion"}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Back Camera", "type": "camera", "status": "online", "is_on": True,
         "settings": {"resolution": "1080p", "night_vision": True, "motion_detection": False,
                      "recording_mode": "continuous"}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Front Door", "type": "door", "status": "online", "is_on": True,
         "settings": {"auto_lock_timer": 30, "pin_enabled": True, "locked": True}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Main Gate", "type": "gate", "status": "online", "is_on": True,
         "settings": {"auto_lock_timer": 60, "locked": True}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Front Doorbell", "type": "doorbell", "status": "online", "is_on": True,
         "settings": {"sound_enabled": True, "video_enabled": True, "last_ring": None}, "created_at": now},
        {"device_id": generate_id("dev"), "home_id": home_id, "owner_id": owner_id,
         "name": "Geyser", "type": "geyser", "status": "online", "is_on": False,
         "settings": {"current_temp": 35, "target_temp": 55, "schedule_enabled": False,
                      "schedule_on": "06:30", "schedule_off": "08:00"}, "created_at": now},
    ]
    await devices_insert_many(pg_pool(), devices)
    await alert_insert(pg_pool(), {
        "alert_id": generate_id("alert"),
        "home_id": home_id, "device_id": None,
        "type": "system", "severity": "info",
        "title": "Welcome to Cohome!",
        "message": "Your home has been set up with 7 devices. Start exploring your dashboard.",
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

# ===================== MODELS =====================

class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class GoogleSessionExchange(BaseModel):
    session_id: str

class HomeCreate(BaseModel):
    name: str
    address: str
    city: str

class HomeUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None

class DeviceCreate(BaseModel):
    name: str
    type: str
    settings: Optional[Dict[str, Any]] = {}

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    is_on: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None

class MemberInvite(BaseModel):
    email: str
    role: str = "member"

class AlertMarkRead(BaseModel):
    alert_ids: List[str]

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await user_find_by_email(pg_pool(), data.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user_id = generate_id("user")
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "user_id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "picture": None,
        "password_hash": password_hash,
        "auth_provider": "email",
        "subscription": "free",
        "created_at": now
    }
    await user_insert(pg_pool(), user)
    token = await create_session(user_id)
    user_response = {k: v for k, v in user.items() if k not in ["password_hash", "_id"]}
    return make_session_response({"user": user_response, "token": token}, token)

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await user_find_by_email(pg_pool(), data.email.lower())
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = await create_session(user["user_id"])
    user_response = {k: v for k, v in user.items() if k not in ["password_hash", "_id"]}
    return make_session_response({"user": user_response, "token": token}, token)

@api_router.post("/auth/google/session")
async def google_session(data: GoogleSessionExchange):
    try:
        resp = req_lib.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": data.session_id},
            timeout=10
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google session")
        oauth_data = resp.json()
    except req_lib.RequestException:
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    email = oauth_data.get("email", "").lower()
    existing = await user_find_by_email(pg_pool(), email)

    if existing:
        user_id = existing["user_id"]
        await user_update_google_profile(
            pg_pool(),
            user_id,
            oauth_data.get("name", existing["name"]),
            oauth_data.get("picture", existing.get("picture")),
        )
        user = await user_find_by_id(pg_pool(), user_id)
    else:
        user_id = generate_id("user")
        now = datetime.now(timezone.utc).isoformat()
        user = {
            "user_id": user_id,
            "email": email,
            "name": oauth_data.get("name", "User"),
            "picture": oauth_data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "subscription": "free",
            "created_at": now
        }
        await user_insert(pg_pool(), user)

    token = await create_session(user_id)
    user_response = {k: v for k, v in user.items() if k not in ["password_hash", "_id"]}
    return make_session_response({"user": user_response, "token": token}, token)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = {k: v for k, v in current_user.items() if k != "password_hash"}
    return user

@api_router.post("/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        await session_delete_by_token(pg_pool(), token)
    resp = JSONResponse(content={"message": "Logged out"})
    resp.delete_cookie(
        key="session_token",
        path="/",
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
    )
    return resp

# ===================== HOME ROUTES =====================

@api_router.get("/homes")
async def get_homes(current_user: dict = Depends(get_current_user)):
    return await homes_list_for_user(pg_pool(), current_user["user_id"])

@api_router.post("/homes")
async def create_home(data: HomeCreate, current_user: dict = Depends(get_current_user)):
    home_id = generate_id("home")
    now = datetime.now(timezone.utc).isoformat()
    home = {
        "home_id": home_id,
        "owner_id": current_user["user_id"],
        "name": data.name,
        "address": data.address,
        "city": data.city,
        "member_ids": [],
        "members": [],
        "created_at": now
    }
    await home_insert(pg_pool(), home)
    await seed_home_devices(home_id, current_user["user_id"])
    return {k: v for k, v in home.items() if k != "_id"}

@api_router.get("/homes/{home_id}")
async def get_home(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await home_find_for_member(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    return home

@api_router.put("/homes/{home_id}")
async def update_home(home_id: str, data: HomeUpdate, current_user: dict = Depends(get_current_user)):
    home = await home_find_owned(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await home_update_fields(pg_pool(), home_id, updates)
    updated = await home_by_id(pg_pool(), home_id)
    return updated

@api_router.delete("/homes/{home_id}")
async def delete_home(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await home_find_owned(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    await home_delete(pg_pool(), home_id)
    return {"message": "Home deleted"}

# ===================== DEVICE ROUTES =====================

@api_router.get("/homes/{home_id}/devices")
async def get_devices(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return await devices_list_by_home(pg_pool(), home_id)

@api_router.post("/homes/{home_id}/devices")
async def create_device(home_id: str, data: DeviceCreate, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    device_id = generate_id("dev")
    device = {
        "device_id": device_id,
        "home_id": home_id,
        "owner_id": current_user["user_id"],
        "name": data.name,
        "type": data.type,
        "status": "online",
        "is_on": False,
        "settings": data.settings or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await device_insert_one(pg_pool(), device)
    return {k: v for k, v in device.items() if k != "_id"}

@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await device_find(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return device

@api_router.put("/devices/{device_id}")
async def update_device(device_id: str, data: DeviceUpdate, current_user: dict = Depends(get_current_user)):
    device = await device_find(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    updates = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.is_on is not None:
        updates["is_on"] = data.is_on
    if data.settings is not None:
        for k, v in data.settings.items():
            updates[f"settings.{k}"] = v
    if updates:
        await device_set_field(pg_pool(), device_id, updates)
    return await device_find(pg_pool(), device_id)

@api_router.patch("/devices/{device_id}/toggle")
async def toggle_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await device_find(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    new_state = not device["is_on"]
    await device_set_field(pg_pool(), device_id, {"is_on": new_state})
    return {"device_id": device_id, "is_on": new_state}

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await device_find(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    await device_delete(pg_pool(), device_id)
    return {"message": "Device deleted"}

@api_router.get("/devices/{device_id}/analytics")
async def get_device_analytics(device_id: str, period: str = "24h", current_user: dict = Depends(get_current_user)):
    device = await device_find(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device["type"] != "solar":
        raise HTTPException(status_code=400, detail="Analytics only available for solar devices")

    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc)
    is_connected = bool(device.get("settings", {}).get("connection_config"))

    if period == "24h":
        since = now - timedelta(hours=24)
        readings = await solar_readings_since_select(
            pg_pool(), device_id, since, ["current_power_w"], True, 500
        )

        # Build hour buckets — average power per hour
        buckets: dict = {}
        for r in readings:
            try:
                ts = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
                key = f"{ts.hour:02d}:00"
                pw = float(r.get("current_power_w") or 0)
                if key not in buckets:
                    buckets[key] = {"sum": 0, "count": 0}
                buckets[key]["sum"] += pw
                buckets[key]["count"] += 1
            except Exception:
                continue

        data = []
        for h in range(24):
            key = f"{h:02d}:00"
            avg_w = buckets[key]["sum"] / buckets[key]["count"] if key in buckets and buckets[key]["count"] > 0 else None
            data.append({
                "time": key,
                "generation_kw": round(avg_w / 1000, 3) if avg_w is not None else None,
                "has_data": avg_w is not None,
            })

    elif period == "7d":
        since = now - timedelta(days=7)
        readings = await solar_readings_since_select(
            pg_pool(), device_id, since, ["today_energy_kwh"], True, 2000
        )

        # Per day: take the MAX today_energy_kwh reading = end-of-day total
        buckets = {}
        for r in readings:
            try:
                ts = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
                key = ts.strftime("%a %d")
                val = float(r.get("today_energy_kwh") or 0)
                buckets[key] = max(buckets.get(key, 0), val)
            except Exception:
                continue

        data = []
        for i in range(7):
            day = now - timedelta(days=6 - i)
            key = day.strftime("%a %d")
            data.append({"date": key, "generation": round(buckets.get(key, 0), 2)})

    else:  # 30d
        since = now - timedelta(days=30)
        readings = await solar_readings_since_select(
            pg_pool(), device_id, since, ["today_energy_kwh"], True, 10000
        )

        buckets = {}
        for r in readings:
            try:
                ts = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
                key = ts.strftime("%d %b")
                val = float(r.get("today_energy_kwh") or 0)
                buckets[key] = max(buckets.get(key, 0), val)
            except Exception:
                continue

        data = []
        for i in range(30):
            day = now - timedelta(days=29 - i)
            key = day.strftime("%d %b")
            data.append({"date": key, "generation": round(buckets.get(key, 0), 2)})

    total_gen = sum(d.get("generation_kw", d.get("generation", 0)) or 0 for d in data)
    rate = float(device.get("settings", {}).get("connection_config", {}).get("electricity_rate_pkr", 35))

    return {
        "device_id": device_id,
        "period": period,
        "has_real_data": is_connected and any(
            (d.get("generation_kw") or d.get("generation", 0)) > 0 for d in data
        ),
        "data": data,
        "summary": {
            "total_generation": round(total_gen, 2),
            "savings_pkr": round(total_gen * rate, 0),
        }
    }

# ===================== ALERT ROUTES =====================

@api_router.get("/alerts")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    return await alerts_list_for_homes(pg_pool(), home_ids)

@api_router.get("/homes/{home_id}/alerts")
async def get_home_alerts(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return await alerts_list_home(pg_pool(), home_id)

@api_router.patch("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    alert = await alert_find(pg_pool(), alert_id, home_ids)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await alert_mark_read(pg_pool(), alert_id)
    return {"alert_id": alert_id, "is_read": True}

@api_router.post("/alerts/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    await alerts_mark_all_read(pg_pool(), home_ids)
    return {"message": "All alerts marked as read"}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    alert = await alert_find(pg_pool(), alert_id, home_ids)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await alert_delete(pg_pool(), alert_id, home_ids)
    return {"message": "Alert deleted"}

# ===================== MEMBER ROUTES =====================

@api_router.get("/homes/{home_id}/members")
async def get_members(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await home_find_for_member(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    return home.get("members", [])

@api_router.post("/homes/{home_id}/members")
async def add_member(home_id: str, data: MemberInvite, current_user: dict = Depends(get_current_user)):
    home = await home_find_owned(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=403, detail="Only home owner can invite members")

    invited_user = await user_find_by_email(pg_pool(), data.email.lower())
    if not invited_user:
        raise HTTPException(status_code=404, detail="User with this email not found")

    if invited_user["user_id"] in home.get("member_ids", []):
        raise HTTPException(status_code=400, detail="User is already a member")

    member_entry = {
        "user_id": invited_user["user_id"],
        "name": invited_user["name"],
        "email": invited_user["email"],
        "picture": invited_user.get("picture"),
        "role": data.role,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    await home_patch_members_add(pg_pool(), home_id, invited_user["user_id"], member_entry)
    return member_entry

@api_router.delete("/homes/{home_id}/members/{member_id}")
async def remove_member(home_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    home = await home_find_owned(pg_pool(), home_id, current_user["user_id"])
    if not home:
        raise HTTPException(status_code=403, detail="Only home owner can remove members")
    await home_patch_members_remove(pg_pool(), home_id, member_id)
    return {"message": "Member removed"}

# ===================== SUBSCRIPTION ROUTES =====================

@api_router.get("/subscription")
async def get_subscription(current_user: dict = Depends(get_current_user)):
    return {
        "user_id": current_user["user_id"],
        "plan": current_user.get("subscription", "free"),
        "features": {
            "free": {"homes": 1, "devices": 5, "analytics": "basic", "family_members": 2},
            "pro": {"homes": -1, "devices": -1, "analytics": "advanced", "family_members": -1}
        }
    }

@api_router.post("/subscription/upgrade")
async def upgrade_subscription(current_user: dict = Depends(get_current_user)):
    await user_set_subscription(pg_pool(), current_user["user_id"], "pro")
    return {"message": "Upgraded to Pro", "plan": "pro"}

# ===================== STATS ROUTE =====================

@api_router.get("/homes/{home_id}/stats")
async def get_home_stats(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    devices = await devices_list_by_home(pg_pool(), home_id, 200)
    total = len(devices)
    online = sum(1 for d in devices if d["status"] == "online")
    active = sum(1 for d in devices if d["is_on"])
    alerts = await alerts_count_unread(pg_pool(), home_id)
    solar = next((d for d in devices if d["type"] == "solar"), None)
    return {
        "total_devices": total,
        "online_devices": online,
        "active_devices": active,
        "unread_alerts": alerts,
        "solar_battery": solar["settings"].get("battery_percentage", 0) if solar else 0,
        "solar_today_kwh": solar["settings"].get("today_generation_kwh", 0) if solar else 0,
        "monthly_savings_pkr": solar["settings"].get("monthly_savings_pkr", 0) if solar else 0
    }


def _esp32_base_url_from_env() -> str:
    raw = (os.environ.get("ESP32_BASE_URL") or os.environ.get("REACT_APP_ESP32_URL") or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()
    if not raw:
        return ""
    rl = raw.lower()
    if not rl.startswith(("http://", "https://")):
        raw = "http://" + raw
    return raw.rstrip("/")


def _esp32_endpoint_from_env(default_path: str, env_key: str) -> str:
    path = (os.environ.get(env_key) or default_path).strip()
    if not path.startswith("/"):
        path = "/" + path
    return path


async def _fetch_json(url: str, timeout: int = 10) -> dict:
    def _do_request() -> dict:
        response = req_lib.get(url, timeout=timeout)
        response.raise_for_status()
        return response.json()

    return await asyncio.to_thread(_do_request)


async def _trigger_esp32_servo_background() -> None:
    base = _esp32_base_url_from_env()
    if not base:
        logger.warning("Predictive trigger skipped: ESP32_BASE_URL is not configured")
        return

    path = _esp32_endpoint_from_env("/servo/on", "ESP32_SERVO_PATH")
    url = f"{base}{path}"
    try:
        await asyncio.to_thread(lambda: req_lib.get(url, timeout=6))
        logger.info("Predictive trigger sent to ESP32: %s", url)
    except req_lib.RequestException as e:
        logger.warning("Predictive trigger failed: %s", e)


async def _fetch_open_meteo_daily_forecast() -> dict:
    weather_url = (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=31.44&longitude=74.27"
        "&daily=temperature_2m_max,precipitation_sum,shortwave_radiation_sum"
        "&timezone=auto"
    )
    return await _fetch_json(weather_url, timeout=12)


def _predict_from_weather(daily: dict) -> dict:
    dates = daily.get("time") or []
    temperatures = daily.get("temperature_2m_max") or []
    precipitation = daily.get("precipitation_sum") or []
    radiation = daily.get("shortwave_radiation_sum") or []

    if not dates or not temperatures or not precipitation or not radiation:
        raise HTTPException(status_code=502, detail="Open-Meteo response missing daily forecast data")

    today = datetime.now().astimezone().date().isoformat()
    if today in dates:
        index = dates.index(today)
    else:
        index = 0

    max_temp = float(temperatures[index] or 0)
    precipitation_value = float(precipitation[index] or 0)
    solar_irradiance = float(radiation[index] or 0) / 3.6
    current_month = datetime.now().astimezone().month
    month_cos = math.cos(2 * math.pi * current_month / 12)

    prediction = (
        9.0488
        + (-4.6126 * month_cos)
        + (-0.3670 * max_temp)
        + (9.5595 * solar_irradiance)
        + (0.0235 * precipitation_value)
    )

    features = {
        "month": current_month,
        "month_cos": round(month_cos, 6),
        "max_temp": max_temp,
        "solar_irradiance": round(solar_irradiance, 6),
        "precipitation": precipitation_value,
    }

    return {
        "prediction": round(prediction, 4),
        "features": features,
        "forecast_date": dates[index],
    }


@api_router.get("/esp32/servo-on")
async def esp32_servo_on_proxy(current_user: dict = Depends(get_current_user)):
    """Forward servo trigger to the board — avoids browser CORS blocking LAN HTTP."""
    base = _esp32_base_url_from_env()
    if not base:
        raise HTTPException(
            status_code=503,
            detail="Set ESP32_BASE_URL or REACT_APP_ESP32_URL in backend .env.local (e.g. http://192.168.18.212)",
        )
    path = (os.environ.get("ESP32_SERVO_PATH") or "/servo/on").strip()
    if not path.startswith("/"):
        path = "/" + path
    url = f"{base}{path}"
    try:
        r = await asyncio.to_thread(lambda: req_lib.get(url, timeout=6))
    except req_lib.RequestException as e:
        logger.warning("ESP32 servo proxy: %s", e)
        raise HTTPException(status_code=502, detail=f"Could not reach ESP32: {e}") from e
    if not r.ok:
        if r.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail=(
                    f'ESP32 has no GET route at "{path}" (requested {url}). '
                    f"In Arduino add server.on(\"{path}\", HTTP_GET, ...) before server.begin(), "
                    f"or set ESP32_SERVO_PATH in backend .env.local to match your existing route."
                ),
            )
        raise HTTPException(
            status_code=502,
            detail=f"ESP32 GET {path} returned HTTP {r.status_code} ({url})",
        )
    return {"ok": True}


@api_router.get("/predictive-trigger")
async def predictive_trigger(current_user: dict = Depends(get_current_user)):
    """Predict whether the wiper should run, then trigger ESP32 without blocking the response."""
    weather_task = asyncio.create_task(_fetch_open_meteo_daily_forecast())

    esp32_data: Optional[dict] = None
    esp32_error: Optional[str] = None
    base = _esp32_base_url_from_env()
    data_path = _esp32_endpoint_from_env("/data", "ESP32_DATA_PATH")

    if base:
        esp32_url = f"{base}{data_path}"
        try:
            esp32_data = await _fetch_json(esp32_url, timeout=8)
        except Exception as e:
            esp32_error = str(e)
            logger.warning("Predictive trigger ESP32 data fetch failed: %s", e)
    else:
        esp32_error = "ESP32_BASE_URL is not configured"

    weather = await weather_task
    daily = weather.get("daily") or {}
    prediction_payload = _predict_from_weather(daily)
    prediction_value = prediction_payload["prediction"]

    wiper_triggered = prediction_value > 50
    if wiper_triggered:
        asyncio.create_task(_trigger_esp32_servo_background())

    return {
        "prediction": prediction_value,
        "features": prediction_payload["features"],
        "forecast_date": prediction_payload["forecast_date"],
        "threshold": 50,
        "wiper_triggered": wiper_triggered,
        "esp32_data": esp32_data,
        "esp32_error": esp32_error,
    }


# ===================== SOLAR INTEGRATION ROUTES =====================

class SolarTestRequest(BaseModel):
    brand: str
    username: Optional[str] = None
    password: Optional[str] = None
    api_token: Optional[str] = None
    key_id: Optional[str] = None
    key_secret: Optional[str] = None
    inverter_ip: Optional[str] = None
    station_id: Optional[str] = None

class SolarConfigureRequest(BaseModel):
    brand: str
    station_id: Optional[str] = None
    station_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    api_token: Optional[str] = None
    key_id: Optional[str] = None
    key_secret: Optional[str] = None
    inverter_ip: Optional[str] = None
    manual_power_w: Optional[float] = None
    manual_today_kwh: Optional[float] = None
    manual_total_kwh: Optional[float] = None
    electricity_rate_pkr: Optional[float] = 35.0

@api_router.post("/solar/test-connection")
async def test_solar_connection(data: SolarTestRequest, current_user: dict = Depends(get_current_user)):
    """Test solar inverter credentials before saving."""
    credentials = {
        "username": data.username,
        "password": data.password,
        "api_token": data.api_token,
        "key_id": data.key_id,
        "key_secret": data.key_secret,
        "inverter_ip": data.inverter_ip,
        "station_id": data.station_id,
    }
    try:
        result = await asyncio.to_thread(test_connection_sync, data.brand, credentials)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Solar test connection error: {e}")
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")

@api_router.post("/devices/{device_id}/solar/configure")
async def configure_solar_device(device_id: str, data: SolarConfigureRequest, current_user: dict = Depends(get_current_user)):
    """Save solar inverter connection configuration (with encrypted password)."""
    device = await device_find_solar(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Solar device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    # Build connection config — encrypt secrets
    config = {
        "brand": data.brand,
        "station_id": data.station_id,
        "station_name": data.station_name or "My Solar Station",
        "electricity_rate_pkr": data.electricity_rate_pkr or 35.0,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.brand in ["goodwe", "huawei", "sungrow", "sma"]:
        config["username"] = data.username
        config["password_enc"] = encrypt_credential(data.password) if data.password else ""
    elif data.brand in ["growatt", "inverex_growatt"]:
        config["api_token"] = decrypt_credential(encrypt_credential(data.api_token)) if data.api_token else ""
        # Store token encrypted
        config["api_token"] = data.api_token  # kept plain for polling (in-memory only, not logged)
    elif data.brand in ["solis", "inverex_solis"]:
        config["key_id_enc"] = encrypt_credential(data.key_id) if data.key_id else ""
        config["key_secret_enc"] = encrypt_credential(data.key_secret) if data.key_secret else ""
    elif data.brand == "fronius":
        config["inverter_ip"] = data.inverter_ip
    elif data.brand == "manual":
        config["manual_power_w"] = data.manual_power_w or 0
        config["manual_today_kwh"] = data.manual_today_kwh or 0
        config["manual_total_kwh"] = data.manual_total_kwh or 0
    else:
        # huawei / sungrow / sma — store creds for future use
        config["username"] = data.username
        config["password_enc"] = encrypt_credential(data.password) if data.password else ""

    await device_drop_settings_keys(pg_pool(), device_id, _SOLAR_STALE_FIELDS)
    await device_settings_merge_nested(
        pg_pool(),
        device_id,
        {
            "connection_config": config,
            "connection_brand": data.brand,
            "connection_status": "connected",
        },
    )

    # Trigger immediate sync for live brands
    live_brands = ["goodwe", "growatt", "fronius", "manual", "solis", "inverex_growatt", "inverex_solis"]
    if data.brand in live_brands:
        asyncio.create_task(sync_solar_device_task(device_id))

    return {"success": True, "message": "Solar inverter configured successfully.", "config": {k: v for k, v in config.items() if k != "password_enc"}}

@api_router.post("/devices/{device_id}/solar/sync")
async def manual_solar_sync(device_id: str, current_user: dict = Depends(get_current_user)):
    """Manually trigger a solar data sync."""
    device = await device_find_solar(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Solar device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    config = device.get("settings", {}).get("connection_config")
    if not config:
        raise HTTPException(status_code=400, detail="Solar device not connected. Configure connection first.")

    try:
        data = await asyncio.to_thread(fetch_solar_live_data, config)
        await _apply_solar_data(device_id, config, data)
        return {
            "success": True,
            "current_power_w": data.get("current_power_w", 0),
            "today_energy_kwh": data.get("today_energy_kwh", 0),
            "total_energy_kwh": data.get("total_energy_kwh", 0),
            "is_online": data.get("is_online", False),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Sync failed: {str(e)}")

@api_router.get("/devices/{device_id}/solar/live")
async def get_solar_live(device_id: str, current_user: dict = Depends(get_current_user)):
    """Get the most recent live solar data (stored from last poll)."""
    device = await device_find_solar(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Solar device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    s = device.get("settings", {})
    config = s.get("connection_config", {})
    return {
        "device_id": device_id,
        "is_connected": bool(config),
        "connection_brand": s.get("connection_brand"),
        "connection_status": s.get("connection_status"),
        "station_name": config.get("station_name"),
        "current_power_w": s.get("current_power_w", 0),
        "today_energy_kwh": s.get("today_generation_kwh", 0),
        "total_energy_kwh": s.get("total_energy_kwh", 0),
        "battery_soc": s.get("battery_soc", 0),
        "grid_import_w": s.get("grid_import_w", 0),
        "grid_export_w": s.get("grid_export_w", 0),
        "grid_voltage_v": s.get("grid_voltage_v", 0),
        "grid_frequency_hz": s.get("grid_frequency_hz", 0),
        "temperature_c": s.get("temperature_c", 0),
        "pv_strings": s.get("pv_strings", []),
        "monthly_savings_pkr": s.get("monthly_savings_pkr", 0),
        "capacity_kw": s.get("capacity_kw"),
        "inverter_model": s.get("inverter_model"),
        "inverter_sn": s.get("inverter_sn"),
        "last_sync": s.get("last_sync"),
        "last_sync_error": s.get("last_sync_error"),
        "electricity_rate_pkr": config.get("electricity_rate_pkr", 35.0),
    }

@api_router.get("/devices/{device_id}/solar/readings")
async def get_solar_readings(device_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)):
    """Get historical solar readings from the database."""
    device = await device_find_solar(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Solar device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    return await solar_readings_list(pg_pool(), device_id, min(limit, 200))

@api_router.delete("/devices/{device_id}/solar/configure")
async def disconnect_solar(device_id: str, current_user: dict = Depends(get_current_user)):
    """Disconnect solar inverter integration."""
    device = await device_find_solar(pg_pool(), device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Solar device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    await device_drop_settings_keys(pg_pool(), device_id, _SOLAR_DISCONNECT_FIELDS)
    await device_set_status(pg_pool(), device_id, "offline")
    return {"success": True, "message": "Solar inverter disconnected."}

# ===================== SOLAR BACKGROUND HELPERS =====================

async def _apply_solar_data(device_id: str, config: dict, data: dict):
    """Update device document and store a reading."""
    rate = float(config.get("electricity_rate_pkr", 35.0))
    monthly_savings = round(data.get("today_energy_kwh", 0) * rate * 30, 0)

    patch: Dict[str, Any] = {
        "today_generation_kwh": data.get("today_energy_kwh", 0),
        "total_energy_kwh": data.get("total_energy_kwh", 0),
        "current_power_w": data.get("current_power_w", 0),
        "grid_voltage_v": data.get("grid_voltage_v", 0),
        "grid_frequency_hz": data.get("grid_frequency_hz", 0),
        "temperature_c": data.get("temperature_c", 0),
        "pv_strings": data.get("pv_strings", []),
        "battery_soc": data.get("battery_soc", 0),
        "grid_import_w": data.get("grid_import_w", 0),
        "grid_export_w": data.get("grid_export_w", 0),
        "monthly_savings_pkr": monthly_savings,
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "last_sync_error": None,
        "inverter_model": data.get("model"),
        "inverter_sn": data.get("inverter_sn"),
    }
    if data.get("capacity_kw"):
        patch["capacity_kw"] = data["capacity_kw"]

    await device_settings_merge_nested(pg_pool(), device_id, patch)
    await device_set_status(pg_pool(), device_id, "online" if data.get("is_online") else "offline")

    await solar_reading_insert(
        pg_pool(),
        {
            "device_id": device_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "current_power_w": data.get("current_power_w", 0),
            "today_energy_kwh": data.get("today_energy_kwh", 0),
            "total_energy_kwh": data.get("total_energy_kwh", 0),
            "grid_voltage_v": data.get("grid_voltage_v", 0),
            "temperature_c": data.get("temperature_c", 0),
            "pv_strings": data.get("pv_strings", []),
            "is_online": data.get("is_online", False),
        },
    )

async def sync_solar_device_task(device_id: str):
    """Fire-and-forget task to sync a single device."""
    await asyncio.sleep(2)
    try:
        device = await device_find(pg_pool(), device_id)
        if not device:
            return
        config = device.get("settings", {}).get("connection_config")
        if not config:
            return
        data = await asyncio.to_thread(fetch_solar_live_data, config)
        await _apply_solar_data(device_id, config, data)
        logger.info(f"Solar sync OK: {device_id} → {data.get('current_power_w', 0):.0f}W")
    except Exception as e:
        logger.error(f"Solar sync failed {device_id}: {e}")
        await device_settings_merge_nested(
            pg_pool(),
            device_id,
            {
                "last_sync_error": str(e),
                "last_sync": datetime.now(timezone.utc).isoformat(),
            },
        )

async def solar_polling_background():
    """Background loop: poll all connected solar devices every 5 minutes."""
    await asyncio.sleep(60)  # wait 60s after startup
    while True:
        try:
            devices = await devices_find_solar_with_connection(pg_pool())

            for device in devices:
                config = device.get("settings", {}).get("connection_config", {})
                live_brands = ["goodwe", "growatt", "fronius", "manual", "solis", "inverex_growatt", "inverex_solis"]
                if config.get("brand") in live_brands:
                    try:
                        data = await asyncio.to_thread(fetch_solar_live_data, config)
                        await _apply_solar_data(device["device_id"], config, data)
                        logger.info(f"Auto-poll: {device['name']} → {data.get('current_power_w', 0):.0f}W")
                    except Exception as e:
                        logger.warning(f"Auto-poll failed {device['device_id']}: {e}")
                        await device_settings_merge_nested(
                            pg_pool(), device["device_id"], {"last_sync_error": str(e)}
                        )
        except Exception as e:
            logger.error(f"Solar background polling error: {e}")

        await asyncio.sleep(300)  # 5 minutes

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    await init_pg_pool()
    asyncio.create_task(solar_polling_background())

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_pg_pool()