"""
Persistence via Supabase PostgREST (/rest/v1) using the publishable API key — no direct Postgres.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

import requests

from supabase_env import supabase_url_and_key

Tz = timezone.utc

_CLIENT: Optional["SupabaseRest"] = None

_SOLAR_SELECT_COLS = frozenset(
    {
        "current_power_w",
        "today_energy_kwh",
        "total_energy_kwh",
        "grid_voltage_v",
        "temperature_c",
        "pv_strings",
        "is_online",
    }
)


@dataclass
class SupabaseRest:
    base: str
    _session: requests.Session

    @classmethod
    def connect(cls, url: str, key: str) -> SupabaseRest:
        s = requests.Session()
        s.headers.update(
            {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        return cls(url.rstrip("/") + "/rest/v1", s)

    def _err(self, r: requests.Response) -> None:
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase REST {r.status_code}: {r.text[:800]}")

    def get(self, table: str, params: Optional[Dict[str, str]] = None) -> List[dict]:
        r = self._session.get(f"{self.base}/{table}", params=params or {}, timeout=120)
        self._err(r)
        if not r.text.strip():
            return []
        data = r.json()
        return data if isinstance(data, list) else [data]

    def get_one(self, table: str, params: Dict[str, str]) -> Optional[dict]:
        p = {**params, "limit": "1"}
        rows = self.get(table, p)
        return rows[0] if rows else None

    def post(self, table: str, body: Any, minimal: bool = True) -> None:
        h = dict(self._session.headers)
        if minimal:
            h["Prefer"] = "return=minimal"
        r = self._session.post(f"{self.base}/{table}", json=body, headers=h, timeout=120)
        self._err(r)

    def patch(self, table: str, params: Dict[str, str], body: dict) -> None:
        r = self._session.patch(f"{self.base}/{table}", params=params, json=body, timeout=120)
        self._err(r)

    def delete(self, table: str, params: Dict[str, str]) -> None:
        r = self._session.delete(f"{self.base}/{table}", params=params, timeout=120)
        self._err(r)

    def count_rows(self, table: str, params: Dict[str, str]) -> int:
        h = dict(self._session.headers)
        h["Prefer"] = "count=exact"
        h["Range"] = "0-0"
        pq = dict(params)
        pq.setdefault("select", "id")
        r = self._session.get(f"{self.base}/{table}", params=pq, headers=h, timeout=120)
        self._err(r)
        cr = r.headers.get("Content-Range") or "*/0"
        if "/" in cr:
            tail = cr.split("/")[-1]
            if tail != "*":
                return int(tail)
        return 0


def _client_get() -> SupabaseRest:
    if _CLIENT is None:
        raise RuntimeError("Supabase client not initialized (call init_pg_pool)")
    return _CLIENT


def _j(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        return json.loads(val)
    return val


def _iso(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.astimezone(Tz).isoformat()
    if isinstance(val, str):
        return val
    return val


def _as_ts(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(str(val).replace("Z", "+00:00"))


def _user_row(d: Optional[dict]) -> Optional[dict]:
    if not d:
        return None
    return {
        "user_id": d["user_id"],
        "email": d["email"],
        "name": d["name"],
        "picture": d.get("picture"),
        "password_hash": d.get("password_hash"),
        "auth_provider": d.get("auth_provider", "email"),
        "subscription": d.get("subscription", "free"),
        "created_at": _iso(d["created_at"]),
    }


def _home_row(d: dict) -> dict:
    mids = d.get("member_ids")
    if mids is None:
        mids = []
    return {
        "home_id": d["home_id"],
        "owner_id": d["owner_id"],
        "name": d["name"],
        "address": d["address"],
        "city": d["city"],
        "member_ids": list(mids),
        "members": _j(d.get("members")) or [],
        "created_at": _iso(d["created_at"]),
    }


def _device_row(d: dict) -> dict:
    return {
        "device_id": d["device_id"],
        "home_id": d["home_id"],
        "owner_id": d["owner_id"],
        "name": d["name"],
        "type": d["type"],
        "status": d["status"],
        "is_on": d["is_on"],
        "settings": _j(d.get("settings")) or {},
        "created_at": _iso(d["created_at"]),
    }


def _alert_row(d: dict) -> dict:
    return {
        "alert_id": d["alert_id"],
        "home_id": d["home_id"],
        "device_id": d.get("device_id"),
        "type": d["type"],
        "severity": d["severity"],
        "title": d["title"],
        "message": d["message"],
        "is_read": d["is_read"],
        "created_at": _iso(d["created_at"]),
    }


def _merge_homes_rows(a: List[dict], b: List[dict], limit: int) -> List[dict]:
    by_id: Dict[str, dict] = {}
    for row in a + b:
        by_id[row["home_id"]] = row
    rows = sorted(by_id.values(), key=lambda x: x["created_at"], reverse=True)
    return rows[:limit]


def _in_list(home_ids: Sequence[str]) -> str:
    return "in.(" + ",".join(home_ids) + ")"


def _member_cs(user_id: str) -> str:
    return f"cs.{{{user_id}}}"


# --------- init ---------


async def init_pg_pool() -> SupabaseRest:
    global _CLIENT

    def _connect() -> SupabaseRest:
        url, key = supabase_url_and_key()
        return SupabaseRest.connect(url, key)

    _CLIENT = await asyncio.to_thread(_connect)
    await asyncio.to_thread(lambda: _client_get().get("users", {"select": "user_id", "limit": "1"}))
    return _CLIENT


async def close_pg_pool() -> None:
    global _CLIENT
    _CLIENT = None


def pg_pool() -> SupabaseRest:
    return _client_get()


async def ping(_pool: Any) -> None:
    await asyncio.to_thread(lambda: _client_get().get("users", {"select": "user_id", "limit": "1"}))


# --------- sessions / users ---------


async def session_find_by_token(_pool: Any, token: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one(
            "user_sessions",
            {
                "select": "session_token,user_id,expires_at,created_at",
                "session_token": f"eq.{token}",
            },
        )
        return dict(row) if row else None

    return await asyncio.to_thread(run)


async def user_find_by_id(_pool: Any, user_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one("users", {"select": "*", "user_id": f"eq.{user_id}"})
        return _user_row(row)

    return await asyncio.to_thread(run)


async def session_insert(
    _pool: Any, token: str, user_id: str, expires_at: datetime, created_at: datetime
) -> None:
    payload = {
        "session_token": token,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "created_at": created_at.isoformat(),
    }

    def run() -> None:
        _client_get().post("user_sessions", payload)

    await asyncio.to_thread(run)


async def session_delete_by_token(_pool: Any, token: str) -> None:
    def run() -> None:
        _client_get().delete("user_sessions", {"session_token": f"eq.{token}"})

    await asyncio.to_thread(run)


async def user_find_by_email(_pool: Any, email: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one("users", {"select": "*", "email": f"eq.{email.lower()}"})
        return _user_row(row)

    return await asyncio.to_thread(run)


async def user_insert(_pool: Any, doc: dict) -> None:
    ca = doc["created_at"]
    ts = _as_ts(ca) if isinstance(ca, str) else ca
    payload = {
        "user_id": doc["user_id"],
        "email": doc["email"].lower(),
        "name": doc["name"],
        "picture": doc.get("picture"),
        "password_hash": doc.get("password_hash"),
        "auth_provider": doc.get("auth_provider", "email"),
        "subscription": doc.get("subscription", "free"),
        "created_at": ts.isoformat(),
    }

    def run() -> None:
        _client_get().post("users", payload)

    await asyncio.to_thread(run)


async def user_update_google_profile(_pool: Any, user_id: str, name: str, picture: Optional[str]) -> None:
    body: Dict[str, Any] = {"name": name}
    if picture is not None:
        body["picture"] = picture

    def run() -> None:
        _client_get().patch("users", {"user_id": f"eq.{user_id}"}, body)

    await asyncio.to_thread(run)


async def user_set_subscription(_pool: Any, user_id: str, plan: str) -> None:
    def run() -> None:
        _client_get().patch("users", {"user_id": f"eq.{user_id}"}, {"subscription": plan})

    await asyncio.to_thread(run)


# --------- homes ---------


async def home_ids_for_user(_pool: Any, user_id: str) -> List[str]:
    def run() -> List[str]:
        c = _client_get()
        a = c.get("homes", {"select": "home_id", "owner_id": f"eq.{user_id}"})
        b = c.get("homes", {"select": "home_id", "member_ids": _member_cs(user_id)})
        ids = {r["home_id"] for r in a}
        ids.update(r["home_id"] for r in b)
        return list(ids)

    return await asyncio.to_thread(run)


async def homes_list_for_user(_pool: Any, user_id: str, limit: int = 100) -> List[dict]:
    def run() -> List[dict]:
        c = _client_get()
        a = c.get("homes", {"select": "*", "owner_id": f"eq.{user_id}"})
        b = c.get("homes", {"select": "*", "member_ids": _member_cs(user_id)})
        merged = _merge_homes_rows(a, b, limit)
        return [_home_row(r) for r in merged]

    return await asyncio.to_thread(run)


async def home_find_for_member(_pool: Any, home_id: str, user_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        c = _client_get()
        row = c.get_one(
            "homes",
            {"select": "*", "home_id": f"eq.{home_id}", "owner_id": f"eq.{user_id}"},
        )
        if row:
            return _home_row(row)
        row = c.get_one(
            "homes",
            {"select": "*", "home_id": f"eq.{home_id}", "member_ids": _member_cs(user_id)},
        )
        return _home_row(row) if row else None

    return await asyncio.to_thread(run)


async def home_find_owned(_pool: Any, home_id: str, owner_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one(
            "homes",
            {"select": "*", "home_id": f"eq.{home_id}", "owner_id": f"eq.{owner_id}"},
        )
        return _home_row(row) if row else None

    return await asyncio.to_thread(run)


async def home_insert(_pool: Any, doc: dict) -> None:
    ca = doc["created_at"]
    ts = _as_ts(ca) if isinstance(ca, str) else ca
    payload = {
        "home_id": doc["home_id"],
        "owner_id": doc["owner_id"],
        "name": doc["name"],
        "address": doc["address"],
        "city": doc["city"],
        "member_ids": doc.get("member_ids") or [],
        "members": doc.get("members") or [],
        "created_at": ts.isoformat(),
    }

    def run() -> None:
        _client_get().post("homes", payload)

    await asyncio.to_thread(run)


async def home_update_fields(_pool: Any, home_id: str, updates: Dict[str, Any]) -> None:
    body = {k: updates[k] for k in ("name", "address", "city") if k in updates}
    if not body:
        return

    def run() -> None:
        _client_get().patch("homes", {"home_id": f"eq.{home_id}"}, body)

    await asyncio.to_thread(run)


async def home_by_id(_pool: Any, home_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one("homes", {"select": "*", "home_id": f"eq.{home_id}"})
        return _home_row(row) if row else None

    return await asyncio.to_thread(run)


async def home_delete(_pool: Any, home_id: str) -> None:
    def run() -> None:
        _client_get().delete("homes", {"home_id": f"eq.{home_id}"})

    await asyncio.to_thread(run)


async def home_patch_members_add(
    _pool: Any,
    home_id: str,
    new_member_id: str,
    member_entry: dict,
) -> None:
    def run() -> None:
        c = _client_get()
        row = c.get_one("homes", {"select": "member_ids,members", "home_id": f"eq.{home_id}"})
        if not row:
            return
        mids = list(row.get("member_ids") or [])
        members = list(_j(row.get("members")) or [])
        if new_member_id not in mids:
            mids.append(new_member_id)
        members.append(member_entry)
        c.patch("homes", {"home_id": f"eq.{home_id}"}, {"member_ids": mids, "members": members})

    await asyncio.to_thread(run)


async def home_patch_members_remove(_pool: Any, home_id: str, member_user_id: str) -> None:
    def run() -> None:
        c = _client_get()
        row = c.get_one("homes", {"select": "member_ids,members", "home_id": f"eq.{home_id}"})
        if not row:
            return
        mids = [m for m in (row.get("member_ids") or []) if m != member_user_id]
        members_raw = _j(row.get("members")) or []
        members = [m for m in members_raw if isinstance(m, dict) and m.get("user_id") != member_user_id]
        c.patch("homes", {"home_id": f"eq.{home_id}"}, {"member_ids": mids, "members": members})

    await asyncio.to_thread(run)


# --------- devices ---------


async def devices_insert_many(_pool: Any, devices: Sequence[dict]) -> None:
    rows = []
    for d in devices:
        ca = d["created_at"]
        ts = _as_ts(ca) if isinstance(ca, str) else ca
        rows.append(
            {
                "device_id": d["device_id"],
                "home_id": d["home_id"],
                "owner_id": d["owner_id"],
                "name": d["name"],
                "type": d["type"],
                "status": d["status"],
                "is_on": d["is_on"],
                "settings": d.get("settings") or {},
                "created_at": ts.isoformat(),
            }
        )

    def run() -> None:
        if rows:
            _client_get().post("devices", rows)

    await asyncio.to_thread(run)


async def devices_list_by_home(_pool: Any, home_id: str, limit: int = 200) -> List[dict]:
    def run() -> List[dict]:
        r = _client_get().get(
            "devices",
            {
                "select": "*",
                "home_id": f"eq.{home_id}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        return [_device_row(dict(x)) for x in r]

    return await asyncio.to_thread(run)


async def device_find(_pool: Any, device_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one("devices", {"select": "*", "device_id": f"eq.{device_id}"})
        return _device_row(row) if row else None

    return await asyncio.to_thread(run)


async def device_find_solar(_pool: Any, device_id: str) -> Optional[dict]:
    def run() -> Optional[dict]:
        row = _client_get().get_one(
            "devices",
            {"select": "*", "device_id": f"eq.{device_id}", "type": "eq.solar"},
        )
        return _device_row(row) if row else None

    return await asyncio.to_thread(run)


async def device_insert_one(_pool: Any, doc: dict) -> None:
    ca = doc["created_at"]
    ts = _as_ts(ca) if isinstance(ca, str) else ca
    payload = {
        "device_id": doc["device_id"],
        "home_id": doc["home_id"],
        "owner_id": doc["owner_id"],
        "name": doc["name"],
        "type": doc["type"],
        "status": doc["status"],
        "is_on": doc["is_on"],
        "settings": doc.get("settings") or {},
        "created_at": ts.isoformat(),
    }

    def run() -> None:
        _client_get().post("devices", payload)

    await asyncio.to_thread(run)


async def device_update_settings_merge(_pool: Any, device_id: str, merge: Dict[str, Any]) -> None:
    def run() -> None:
        c = _client_get()
        row = c.get_one("devices", {"select": "settings", "device_id": f"eq.{device_id}"})
        if not row:
            return
        cur = dict(_j(row.get("settings")) or {})
        cur.update(merge)
        c.patch("devices", {"device_id": f"eq.{device_id}"}, {"settings": cur})

    await asyncio.to_thread(run)


async def device_settings_merge_nested(_pool: Any, device_id: str, patch: Dict[str, Any]) -> None:
    def run() -> None:
        c = _client_get()
        row = c.get_one("devices", {"select": "settings", "device_id": f"eq.{device_id}"})
        if not row:
            return
        cur = dict(_j(row.get("settings")) or {})
        cur.update(patch)
        c.patch("devices", {"device_id": f"eq.{device_id}"}, {"settings": cur})

    await asyncio.to_thread(run)


async def device_set_status(_pool: Any, device_id: str, status: str) -> None:
    def run() -> None:
        _client_get().patch("devices", {"device_id": f"eq.{device_id}"}, {"status": status})

    await asyncio.to_thread(run)


async def device_drop_settings_keys(_pool: Any, device_id: str, keys: Sequence[str]) -> None:
    def run() -> None:
        c = _client_get()
        row = c.get_one("devices", {"select": "settings", "device_id": f"eq.{device_id}"})
        if not row:
            return
        cur = dict(_j(row.get("settings")) or {})
        for k in keys:
            cur.pop(k, None)
        c.patch("devices", {"device_id": f"eq.{device_id}"}, {"settings": cur})

    await asyncio.to_thread(run)


async def device_delete(_pool: Any, device_id: str) -> None:
    def run() -> None:
        _client_get().delete("devices", {"device_id": f"eq.{device_id}"})

    await asyncio.to_thread(run)


async def device_set_field(_pool: Any, device_id: str, field_updates: Dict[str, Any]) -> None:
    settings_merge: Dict[str, Any] = {}
    cols: Dict[str, Any] = {}
    for k, v in field_updates.items():
        if "." in k and k.startswith("settings."):
            sub = k.split(".", 1)[1]
            settings_merge[sub] = v
        elif k in ("name", "is_on", "status"):
            cols[k] = v

    def run() -> None:
        c = _client_get()
        row = c.get_one("devices", {"select": "settings", "device_id": f"eq.{device_id}"})
        if not row:
            return
        cur = dict(_j(row.get("settings")) or {})
        cur.update(settings_merge)
        body: Dict[str, Any] = {"settings": cur, **cols}
        c.patch("devices", {"device_id": f"eq.{device_id}"}, body)

    await asyncio.to_thread(run)


async def devices_find_solar_with_connection(_pool: Any, limit: int = 100) -> List[dict]:
    def run() -> List[dict]:
        r = _client_get().get(
            "devices",
            {
                "select": "device_id,name,settings",
                "type": "eq.solar",
                "limit": str(max(limit * 5, 50)),
            },
        )
        out: List[dict] = []
        for raw in r:
            settings = _j(raw.get("settings")) or {}
            if isinstance(settings, dict) and "connection_config" in settings:
                out.append(
                    {"device_id": raw["device_id"], "name": raw["name"], "settings": settings}
                )
            if len(out) >= limit:
                break
        return out[:limit]

    return await asyncio.to_thread(run)


# --------- alerts ---------


async def alerts_list_for_homes(_pool: Any, home_ids: Sequence[str], limit: int = 100) -> List[dict]:
    if not home_ids:
        return []

    def run() -> List[dict]:
        r = _client_get().get(
            "alerts",
            {
                "select": "*",
                "home_id": _in_list(list(home_ids)),
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        return [_alert_row(dict(x)) for x in r]

    return await asyncio.to_thread(run)


async def alerts_list_home(_pool: Any, home_id: str, limit: int = 100) -> List[dict]:
    def run() -> List[dict]:
        r = _client_get().get(
            "alerts",
            {
                "select": "*",
                "home_id": f"eq.{home_id}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        return [_alert_row(dict(x)) for x in r]

    return await asyncio.to_thread(run)


async def alert_find(_pool: Any, alert_id: str, home_ids: Sequence[str]) -> Optional[dict]:
    if not home_ids:
        return None

    def run() -> Optional[dict]:
        row = _client_get().get_one(
            "alerts",
            {"select": "*", "alert_id": f"eq.{alert_id}", "home_id": _in_list(list(home_ids))},
        )
        return _alert_row(row) if row else None

    return await asyncio.to_thread(run)


async def alert_mark_read(_pool: Any, alert_id: str) -> None:
    def run() -> None:
        _client_get().patch("alerts", {"alert_id": f"eq.{alert_id}"}, {"is_read": True})

    await asyncio.to_thread(run)


async def alerts_mark_all_read(_pool: Any, home_ids: Sequence[str]) -> None:
    if not home_ids:
        return

    def run() -> None:
        _client_get().patch("alerts", {"home_id": _in_list(list(home_ids))}, {"is_read": True})

    await asyncio.to_thread(run)


async def alert_delete(_pool: Any, alert_id: str, home_ids: Sequence[str]) -> None:
    if not home_ids:
        return

    def run() -> None:
        _client_get().delete(
            "alerts",
            {"alert_id": f"eq.{alert_id}", "home_id": _in_list(list(home_ids))},
        )

    await asyncio.to_thread(run)


async def alert_insert(_pool: Any, doc: dict) -> None:
    ca = doc["created_at"]
    ts = _as_ts(ca) if isinstance(ca, str) else ca
    payload = {
        "alert_id": doc["alert_id"],
        "home_id": doc["home_id"],
        "device_id": doc.get("device_id"),
        "type": doc["type"],
        "severity": doc["severity"],
        "title": doc["title"],
        "message": doc["message"],
        "is_read": doc.get("is_read", False),
        "created_at": ts.isoformat(),
    }

    def run() -> None:
        _client_get().post("alerts", payload)

    await asyncio.to_thread(run)


async def alerts_count_unread(_pool: Any, home_id: str) -> int:
    def run() -> int:
        return _client_get().count_rows(
            "alerts",
            {
                "home_id": f"eq.{home_id}",
                "is_read": "eq.false",
                "select": "alert_id",
            },
        )

    return await asyncio.to_thread(run)


# --------- solar readings ---------


def _row_ts_iso(record: dict) -> dict:
    if "timestamp" in record and record["timestamp"]:
        record = dict(record)
        record["timestamp"] = _iso(record["timestamp"])
    return record


async def solar_readings_since_select(
    _pool: Any,
    device_id: str,
    since: datetime,
    extra_cols: Sequence[str],
    order_asc: bool = True,
    limit_n: int = 10000,
) -> List[dict]:
    cols = ["timestamp"] + [c for c in extra_cols if c in _SOLAR_SELECT_COLS]
    select_list = ",".join(cols)
    order = "timestamp.asc" if order_asc else "timestamp.desc"

    def run() -> List[dict]:
        r = _client_get().get(
            "solar_readings",
            {
                "select": select_list,
                "device_id": f"eq.{device_id}",
                "timestamp": f"gte.{since.isoformat()}",
                "order": order,
                "limit": str(limit_n),
            },
        )
        return [_row_ts_iso(dict(x)) for x in r]

    return await asyncio.to_thread(run)


async def solar_readings_list(_pool: Any, device_id: str, limit_n: int) -> List[dict]:
    sel = (
        "device_id,timestamp,current_power_w,today_energy_kwh,total_energy_kwh,"
        "grid_voltage_v,temperature_c,pv_strings,is_online"
    )

    def run() -> List[dict]:
        r = _client_get().get(
            "solar_readings",
            {
                "select": sel,
                "device_id": f"eq.{device_id}",
                "order": "timestamp.desc",
                "limit": str(limit_n),
            },
        )
        out: List[dict] = []
        for raw in r:
            row = dict(raw)
            row["timestamp"] = _iso(row["timestamp"])
            row["pv_strings"] = _j(row["pv_strings"]) if row.get("pv_strings") is not None else []
            out.append(row)
        for item in out:
            item.setdefault("temperature_c", 0)
        return out

    return await asyncio.to_thread(run)


async def solar_reading_insert(_pool: Any, doc: dict) -> None:
    ts_raw = doc["timestamp"]
    ts = _as_ts(ts_raw) if isinstance(ts_raw, str) else ts_raw
    pv = doc.get("pv_strings")
    payload = {
        "device_id": doc["device_id"],
        "timestamp": ts.isoformat(),
        "current_power_w": doc.get("current_power_w"),
        "today_energy_kwh": doc.get("today_energy_kwh"),
        "total_energy_kwh": doc.get("total_energy_kwh"),
        "grid_voltage_v": doc.get("grid_voltage_v"),
        "temperature_c": doc.get("temperature_c"),
        "pv_strings": pv if pv is not None else [],
        "is_online": doc.get("is_online"),
    }

    def run() -> None:
        _client_get().post("solar_readings", payload)

    await asyncio.to_thread(run)
