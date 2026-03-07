"""
Solar Inverter Integration Service
Supports: GoodWe (SEMS), Fronius (Local API), Manual Entry
Coming soon: Huawei, Growatt, Sungrow, Solis, SMA, Inverex
"""

import json
import requests
import os
import logging
from cryptography.fernet import Fernet
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ===================== ENCRYPTION =====================

def get_fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        import base64, hashlib
        seed = os.environ.get("MONGO_URL", "cohome-fallback-key-dev")
        key = base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_credential(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()

def decrypt_credential(value: str) -> str:
    return get_fernet().decrypt(value.encode()).decode()


# ===================== GOODWE SEMS =====================

class SEMSConnector:
    """GoodWe SEMS Portal (semsportal.com) integration"""
    BASE_URL = "https://www.semsportal.com/api"

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.token = None
        self.uid = None
        self.timestamp = None
        self.api_domain = None

    def _base_header(self) -> str:
        return json.dumps({"version": "v2.1.0", "client": "ios", "language": "en"})

    def _auth_header(self) -> str:
        return json.dumps({
            "version": "v2.1.0", "client": "ios", "language": "en",
            "timestamp": self.timestamp, "uid": self.uid, "token": self.token
        })

    def login(self) -> dict:
        resp = requests.post(
            f"{self.BASE_URL}/v1/Common/CrossLogin",
            json={"account": self.username, "pwd": self.password},
            headers={"Content-Type": "application/json", "Token": self._base_header()},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(f"SEMS login failed: {data.get('msg', 'Invalid credentials')}")

        self.token = data["data"]["token"]
        self.uid = data["data"]["uid"]
        self.timestamp = data["data"]["timestamp"]
        self.api_domain = data["data"]["api"]
        return data["data"]

    def get_stations(self) -> list:
        if not self.token:
            self.login()
        resp = requests.post(
            f"{self.api_domain}/v1/PowerStation/GetPowerStationList",
            json={"pageSize": 20, "pageIndex": 1, "orderByIndex": 0},
            headers={"Content-Type": "application/json", "Token": self._auth_header()},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(f"Failed to list stations: {data.get('msg', 'Error')}")
        return data.get("data", {}).get("list", [])

    def get_station_data(self, station_id: str) -> dict:
        if not self.token:
            self.login()
        resp = requests.post(
            f"{self.api_domain}/v1/PowerStation/GetMonitorDetailByPowerstationId",
            json={"powerStationId": station_id},
            headers={"Content-Type": "application/json", "Token": self._auth_header()},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(f"Failed to get data: {data.get('msg', 'Error')}")
        return self._parse(data.get("data", {}))

    def _parse(self, data: dict) -> dict:
        inv_list = data.get("inverter", [])
        inv = inv_list[0] if isinstance(inv_list, list) and inv_list else (inv_list if isinstance(inv_list, dict) else {})
        info = data.get("info", {})

        vpv1 = float(inv.get("vpv1", 0) or 0)
        ipv1 = float(inv.get("ipv1", 0) or 0)
        vpv2 = float(inv.get("vpv2", 0) or 0)
        ipv2 = float(inv.get("ipv2", 0) or 0)

        return {
            "is_online": info.get("status", 0) == 1,
            "current_power_w": float(inv.get("output_power", 0) or 0),
            "today_energy_kwh": float(inv.get("eday", 0) or 0),
            "total_energy_kwh": float(inv.get("etotal", 0) or 0),
            "grid_voltage_v": float(inv.get("vac1", 0) or 0),
            "grid_frequency_hz": float(inv.get("fac1", 0) or 0),
            "temperature_c": float(inv.get("tempperature", 0) or 0),
            "pv_strings": [
                {"string": 1, "voltage_v": vpv1, "current_a": ipv1, "power_w": vpv1 * ipv1},
                {"string": 2, "voltage_v": vpv2, "current_a": ipv2, "power_w": vpv2 * ipv2},
            ],
            "inverter_sn": inv.get("sn"),
            "model": inv.get("model_type"),
            "rssi": inv.get("rssi"),
            "last_update": inv.get("last_update_time"),
            "station_name": info.get("stationname", "My Station"),
            "total_hours": float(inv.get("htotal", 0) or 0),
        }


# ===================== FRONIUS LOCAL =====================

class FroniusConnector:
    """Fronius local API — no cloud needed, direct LAN access"""

    def __init__(self, inverter_ip: str, device_id: int = 1):
        self.base_url = f"http://{inverter_ip.strip()}/solar_api/v1"
        self.device_id = device_id

    def get_realtime_data(self) -> dict:
        resp = requests.get(
            f"{self.base_url}/GetInverterRealtimeData.cgi",
            params={"Scope": "Device", "DeviceId": self.device_id, "DataCollection": "CommonInverterData"},
            timeout=5
        )
        resp.raise_for_status()
        body = resp.json().get("Body", {}).get("Data", {})

        def val(key):
            return float((body.get(key) or {}).get("Value", 0) or 0)

        return {
            "is_online": True,
            "current_power_w": val("PAC"),
            "today_energy_kwh": val("DAY_ENERGY") / 1000,
            "total_energy_kwh": val("TOTAL_ENERGY") / 1000,
            "grid_voltage_v": val("UAC"),
            "grid_frequency_hz": val("FAC"),
            "temperature_c": val("T_AMBIENT"),
            "pv_strings": [],
            "station_name": f"Fronius Inverter",
        }


# ===================== DISPATCHER =====================

def test_connection_sync(brand: str, credentials: dict) -> dict:
    """Test solar connection (synchronous — run in thread). Returns station info."""
    try:
        if brand == "goodwe":
            connector = SEMSConnector(credentials["username"], credentials["password"])
            connector.login()
            stations = connector.get_stations()
            return {
                "success": True,
                "message": f"Connected to SEMS! Found {len(stations)} station(s).",
                "stations": [
                    {
                        "id": s.get("id") or s.get("powerstation_id") or s.get("stationId", ""),
                        "name": s.get("stationname") or s.get("name", "Station"),
                        "capacity": s.get("capacity", 0),
                        "address": s.get("address", ""),
                    }
                    for s in stations[:5]
                ],
            }

        elif brand == "fronius":
            connector = FroniusConnector(credentials["inverter_ip"])
            data = connector.get_realtime_data()
            return {
                "success": True,
                "message": f"Fronius connected! Current: {data['current_power_w']/1000:.2f} kW",
                "stations": [{"id": "local", "name": "Fronius Inverter", "capacity": 0}],
            }

        elif brand == "manual":
            return {
                "success": True,
                "message": "Manual data entry set up successfully.",
                "stations": [{"id": "manual", "name": "Manual Entry", "capacity": 0}],
            }

        elif brand in ["huawei", "growatt", "sungrow", "solis", "sma", "inverex"]:
            brand_names = {
                "huawei": "Huawei FusionSolar", "growatt": "Growatt ShineMonitor",
                "sungrow": "Sungrow iSolarCloud", "solis": "Solis Cloud",
                "sma": "SMA Sunny Portal", "inverex": "Inverex",
            }
            return {
                "success": True,
                "coming_soon": True,
                "message": f"{brand_names.get(brand, brand)} integration is in development. Credentials saved — you'll get live data when it launches!",
                "stations": [{"id": "pending", "name": "Pending Integration", "capacity": 0}],
            }

        else:
            raise ValueError(f"Unknown brand: {brand}")

    except requests.exceptions.ConnectionError:
        raise ValueError("Cannot connect. Check your internet / inverter IP.")
    except requests.exceptions.Timeout:
        raise ValueError("Connection timed out. Verify IP / network access.")


def fetch_solar_live_data(connection_config: dict) -> dict:
    """Fetch real-time solar data (synchronous — run in thread)."""
    brand = connection_config.get("brand")

    if brand == "goodwe":
        connector = SEMSConnector(
            connection_config["username"],
            decrypt_credential(connection_config["password_enc"])
        )
        connector.login()
        return connector.get_station_data(connection_config["station_id"])

    elif brand == "fronius":
        return FroniusConnector(connection_config["inverter_ip"]).get_realtime_data()

    elif brand == "manual":
        return {
            "is_online": True,
            "current_power_w": float(connection_config.get("manual_power_w", 0)),
            "today_energy_kwh": float(connection_config.get("manual_today_kwh", 0)),
            "total_energy_kwh": float(connection_config.get("manual_total_kwh", 0)),
            "grid_voltage_v": 220.0,
            "grid_frequency_hz": 50.0,
            "temperature_c": 0,
            "pv_strings": [],
            "station_name": "Manual Entry",
        }

    else:
        raise ValueError(f"Live data not yet available for brand: {brand}")
