from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import uuid
import bcrypt
import requests as req_lib
import random
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    return token

def make_session_response(data: dict, token: str) -> JSONResponse:
    resp = JSONResponse(content=data)
    resp.set_cookie(
        key="session_token",
        value=token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/"
    )
    return resp

async def get_user_home_ids(user_id: str) -> List[str]:
    homes = await db.homes.find(
        {"$or": [{"owner_id": user_id}, {"member_ids": user_id}]},
        {"_id": 0, "home_id": 1}
    ).to_list(100)
    return [h["home_id"] for h in homes]

def generate_solar_analytics(period: str) -> List[dict]:
    now = datetime.now(timezone.utc)
    data = []
    if period == "24h":
        for i in range(24):
            t = now - timedelta(hours=23 - i)
            hour = t.hour
            if 6 <= hour <= 18:
                generation = max(0, 5.0 * (1 - ((hour - 12) / 7) ** 2) + random.uniform(-0.3, 0.3))
            else:
                generation = 0
            data.append({
                "time": f"{hour:02d}:00",
                "generation": round(generation, 2),
                "consumption": round(1.8 + random.uniform(-0.4, 0.6), 2)
            })
    elif period == "7d":
        for i in range(7):
            t = now - timedelta(days=6 - i)
            data.append({
                "date": t.strftime("%a"),
                "generation": round(random.uniform(18, 28), 1),
                "consumption": round(random.uniform(12, 20), 1)
            })
    elif period == "30d":
        for i in range(30):
            t = now - timedelta(days=29 - i)
            data.append({
                "date": t.strftime("%d %b"),
                "generation": round(random.uniform(14, 30), 1),
                "consumption": round(random.uniform(10, 22), 1)
            })
    return data

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
    await db.devices.insert_many(devices)
    await db.alerts.insert_one({
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
    existing = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
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
    await db.users.insert_one(user)
    token = await create_session(user_id)
    user_response = {k: v for k, v in user.items() if k not in ["password_hash", "_id"]}
    return make_session_response({"user": user_response, "token": token}, token)

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
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
    existing = await db.users.find_one({"email": email}, {"_id": 0})

    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": oauth_data.get("name", existing["name"]),
                      "picture": oauth_data.get("picture", existing.get("picture"))}}
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
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
        await db.users.insert_one(user)

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
        await db.user_sessions.delete_one({"session_token": token})
    resp = JSONResponse(content={"message": "Logged out"})
    resp.delete_cookie(key="session_token", path="/", secure=True, samesite="none")
    return resp

# ===================== HOME ROUTES =====================

@api_router.get("/homes")
async def get_homes(current_user: dict = Depends(get_current_user)):
    homes = await db.homes.find(
        {"$or": [{"owner_id": current_user["user_id"]}, {"member_ids": current_user["user_id"]}]},
        {"_id": 0}
    ).to_list(100)
    return homes

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
    await db.homes.insert_one(home)
    await seed_home_devices(home_id, current_user["user_id"])
    return {k: v for k, v in home.items() if k != "_id"}

@api_router.get("/homes/{home_id}")
async def get_home(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one(
        {"home_id": home_id, "$or": [{"owner_id": current_user["user_id"]}, {"member_ids": current_user["user_id"]}]},
        {"_id": 0}
    )
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    return home

@api_router.put("/homes/{home_id}")
async def update_home(home_id: str, data: HomeUpdate, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one({"home_id": home_id, "owner_id": current_user["user_id"]}, {"_id": 0})
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.homes.update_one({"home_id": home_id}, {"$set": updates})
    updated = await db.homes.find_one({"home_id": home_id}, {"_id": 0})
    return updated

@api_router.delete("/homes/{home_id}")
async def delete_home(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one({"home_id": home_id, "owner_id": current_user["user_id"]}, {"_id": 0})
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    await db.homes.delete_one({"home_id": home_id})
    await db.devices.delete_many({"home_id": home_id})
    await db.alerts.delete_many({"home_id": home_id})
    return {"message": "Home deleted"}

# ===================== DEVICE ROUTES =====================

@api_router.get("/homes/{home_id}/devices")
async def get_devices(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    devices = await db.devices.find({"home_id": home_id}, {"_id": 0}).to_list(200)
    return devices

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
    await db.devices.insert_one(device)
    return {k: v for k, v in device.items() if k != "_id"}

@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return device

@api_router.put("/devices/{device_id}")
async def update_device(device_id: str, data: DeviceUpdate, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
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
        await db.devices.update_one({"device_id": device_id}, {"$set": updates})
    return await db.devices.find_one({"device_id": device_id}, {"_id": 0})

@api_router.patch("/devices/{device_id}/toggle")
async def toggle_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    new_state = not device["is_on"]
    await db.devices.update_one({"device_id": device_id}, {"$set": {"is_on": new_state}})
    return {"device_id": device_id, "is_on": new_state}

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    home_ids = await get_user_home_ids(current_user["user_id"])
    if device["home_id"] not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.devices.delete_one({"device_id": device_id})
    return {"message": "Device deleted"}

@api_router.get("/devices/{device_id}/analytics")
async def get_device_analytics(device_id: str, period: str = "24h", current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device["type"] != "solar":
        raise HTTPException(status_code=400, detail="Analytics only available for solar devices")
    data = generate_solar_analytics(period)
    total_generation = sum(d.get("generation", 0) for d in data)
    total_consumption = sum(d.get("consumption", 0) for d in data)
    return {
        "device_id": device_id,
        "period": period,
        "data": data,
        "summary": {
            "total_generation": round(total_generation, 2),
            "total_consumption": round(total_consumption, 2),
            "net_export": round(total_generation - total_consumption, 2),
            "savings_pkr": round(total_generation * 45, 0)
        }
    }

# ===================== ALERT ROUTES =====================

@api_router.get("/alerts")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    alerts = await db.alerts.find({"home_id": {"$in": home_ids}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@api_router.get("/homes/{home_id}/alerts")
async def get_home_alerts(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    alerts = await db.alerts.find({"home_id": home_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@api_router.patch("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    alert = await db.alerts.find_one({"alert_id": alert_id, "home_id": {"$in": home_ids}}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.alerts.update_one({"alert_id": alert_id}, {"$set": {"is_read": True}})
    return {"alert_id": alert_id, "is_read": True}

@api_router.post("/alerts/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    await db.alerts.update_many({"home_id": {"$in": home_ids}}, {"$set": {"is_read": True}})
    return {"message": "All alerts marked as read"}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    alert = await db.alerts.find_one({"alert_id": alert_id, "home_id": {"$in": home_ids}}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.alerts.delete_one({"alert_id": alert_id})
    return {"message": "Alert deleted"}

# ===================== MEMBER ROUTES =====================

@api_router.get("/homes/{home_id}/members")
async def get_members(home_id: str, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one(
        {"home_id": home_id, "$or": [{"owner_id": current_user["user_id"]}, {"member_ids": current_user["user_id"]}]},
        {"_id": 0}
    )
    if not home:
        raise HTTPException(status_code=404, detail="Home not found")
    return home.get("members", [])

@api_router.post("/homes/{home_id}/members")
async def add_member(home_id: str, data: MemberInvite, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one({"home_id": home_id, "owner_id": current_user["user_id"]}, {"_id": 0})
    if not home:
        raise HTTPException(status_code=403, detail="Only home owner can invite members")

    invited_user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
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
    await db.homes.update_one(
        {"home_id": home_id},
        {"$addToSet": {"member_ids": invited_user["user_id"]}, "$push": {"members": member_entry}}
    )
    return member_entry

@api_router.delete("/homes/{home_id}/members/{member_id}")
async def remove_member(home_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    home = await db.homes.find_one({"home_id": home_id, "owner_id": current_user["user_id"]}, {"_id": 0})
    if not home:
        raise HTTPException(status_code=403, detail="Only home owner can remove members")
    await db.homes.update_one(
        {"home_id": home_id},
        {"$pull": {"member_ids": member_id, "members": {"user_id": member_id}}}
    )
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
    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"subscription": "pro"}}
    )
    return {"message": "Upgraded to Pro", "plan": "pro"}

# ===================== STATS ROUTE =====================

@api_router.get("/homes/{home_id}/stats")
async def get_home_stats(home_id: str, current_user: dict = Depends(get_current_user)):
    home_ids = await get_user_home_ids(current_user["user_id"])
    if home_id not in home_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    devices = await db.devices.find({"home_id": home_id}, {"_id": 0}).to_list(200)
    total = len(devices)
    online = sum(1 for d in devices if d["status"] == "online")
    active = sum(1 for d in devices if d["is_on"])
    alerts = await db.alerts.count_documents({"home_id": home_id, "is_read": False})
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

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
