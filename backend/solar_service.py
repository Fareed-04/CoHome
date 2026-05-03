"""
Solar Inverter Integration Service
Normalized data schema returned by every adapter:
{
    is_online, current_power_w, today_energy_kwh, total_energy_kwh,
    grid_voltage_v, grid_frequency_hz, temperature_c, capacity_kw,
    battery_soc, grid_import_w, grid_export_w,
    pv_strings, inverter_sn, model, station_name
}
"""

import re
import json
import hmac
import hashlib
import base64
import time
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
        import base64 as b64, hashlib as hs
        seed = os.environ.get("SUPABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("MONGO_URL", "cohome-fallback-key-dev")
        key = b64.urlsafe_b64encode(hs.sha256(seed.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_credential(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()

def decrypt_credential(value: str) -> str:
    return get_fernet().decrypt(value.encode()).decode()

def fval(v, default=0.0) -> float:
    """Convert any solar API value to float. Handles None, '', '0W', '230.5V', etc."""
    if v is None or v == "":
        return float(default)
    try:
        return float(v)
    except (ValueError, TypeError):
        m = re.match(r"^-?[\d.]+", str(v).strip())
        return float(m.group()) if m else float(default)


# ===================== GOODWE SEMS =====================

class SEMSConnector:
    BASE_URL = "https://www.semsportal.com/api"

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.token = self.uid = self.timestamp = self.api_domain = None

    def _base_header(self) -> str:
        return json.dumps({"version": "v2.1.0", "client": "ios", "language": "en"})

    def _auth_header(self) -> str:
        return json.dumps({
            "version": "v2.1.0", "client": "ios", "language": "en",
            "timestamp": self.timestamp, "uid": self.uid, "token": self.token
        })

    def login(self) -> dict:
        resp = requests.post(
            f"{self.BASE_URL}/v2/Common/CrossLogin",
            json={"account": self.username, "pwd": self.password},
            headers={"Content-Type": "application/json", "Token": self._base_header()},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        code = data.get("code")
        if str(code) != "0":
            msg = data.get("msg") or data.get("message") or "Login failed"
            raise ValueError(f"SEMS login error (code {code}): {msg}")
        d = data.get("data") or {}
        self.token = d.get("token")
        self.uid = d.get("uid")
        self.timestamp = d.get("timestamp")
        raw_api = d.get("api") or self.BASE_URL
        self.api_domain = raw_api.rstrip("/")
        logger.info(f"SEMS login OK — api_domain: {self.api_domain}")
        return d

    def get_station_data(self, station_id: str) -> dict:
        if not self.token:
            self.login()
        resp = requests.post(
            f"{self.api_domain}/v2/PowerStation/GetMonitorDetailByPowerstationId",
            json={"powerStationId": station_id},
            headers={"Content-Type": "application/json", "Token": self._auth_header()},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if str(data.get("code", "")) != "0":
            raise ValueError(f"Failed to get station data: {data.get('msg', data.get('message', 'Unknown error'))}")
        return self._parse(data.get("data", {}))

    def _parse(self, data: dict) -> dict:
        inv_list = data.get("inverter", [])
        inv = inv_list[0] if isinstance(inv_list, list) and inv_list else (inv_list if isinstance(inv_list, dict) else {})
        info = data.get("info", {})
        vpv1, ipv1 = fval(inv.get("vpv1")), fval(inv.get("ipv1"))
        vpv2, ipv2 = fval(inv.get("vpv2")), fval(inv.get("ipv2"))
        return {
            "is_online": info.get("status", 0) == 1,
            "current_power_w": fval(inv.get("output_power") or inv.get("pac")),
            "today_energy_kwh": fval(inv.get("eday")),
            "total_energy_kwh": fval(inv.get("etotal")),
            "grid_voltage_v": fval(inv.get("vac1")),
            "grid_frequency_hz": fval(inv.get("fac1")),
            "temperature_c": fval(inv.get("tempperature") or inv.get("temperature")),
            "capacity_kw": fval(info.get("capacity")),
            "battery_soc": 0,
            "grid_import_w": 0,
            "grid_export_w": fval(inv.get("output_power") or inv.get("pac")),
            "pv_strings": [
                {"string": 1, "voltage_v": vpv1, "current_a": ipv1, "power_w": vpv1 * ipv1},
                {"string": 2, "voltage_v": vpv2, "current_a": ipv2, "power_w": vpv2 * ipv2},
            ],
            "inverter_sn": inv.get("sn"),
            "model": inv.get("model_type"),
            "station_name": info.get("stationname", "My Station"),
        }


# ===================== GROWATT SHINEMONITOR =====================

class GrowattConnector:
    """Growatt — OpenApiV1 with API Token (username/password login deprecated by Growatt in 2025)"""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self._api = None

    def _get_api(self):
        if self._api is None:
            import growattServer
            self._api = growattServer.OpenApiV1(token=self.api_token)
        return self._api

    def get_plants(self) -> list:
        api = self._get_api()
        result = api.plant_list()
        logger.info(f"Growatt plant_list raw: {str(result)[:500]}")
        plants = result.get("plants") or result.get("data") or []
        if not plants:
            raise ValueError("No plants found. Verify your Growatt API token is correct.")
        return plants

    def get_plant_data(self, plant_id: str) -> dict:
        api = self._get_api()
        # If no plant_id stored, auto-discover the first plant
        if not plant_id:
            plants = self.get_plants()
            plant_id = str(plants[0].get("id", ""))
            logger.info(f"Growatt: auto-discovered plant_id={plant_id}")

        # CRITICAL: device_list requires int plant_id
        devices_resp = api.device_list(int(plant_id))
        device_list = (devices_resp.get("data") or {}).get("devices") or []
        if not device_list:
            raise ValueError(f"No devices found in Growatt plant {plant_id}")

        device = device_list[0]
        # Correct key per Growatt V1 API docs
        device_sn = device.get("device_sn") or device.get("deviceSn") or ""
        # device type is int: 1=inverter, 5=sph, 6=spa, 7=min/TLX
        device_type = int(device.get("type") or device.get("device_type") or 0)
        detail = {}
        logger.info(f"Growatt device: sn={device_sn} type={device_type} status={device.get('status')}")

        try:
            if device_type in [5, 6]:  # SPH / SPA — Mix-type with battery
                detail = api.mix_info(device_sn, plant_id=plant_id) or {}
                pac = fval(detail.get("pac") or detail.get("ppv"))
                eday = fval(detail.get("epvToday") or detail.get("etoday"))
                etotal = fval(detail.get("epvTotal") or detail.get("etotal"))
                soc = fval(detail.get("capacity") or detail.get("soc"))
                grid_import = fval(detail.get("pacToUser") or detail.get("pactouse"))
                grid_export = fval(detail.get("pacToGrid") or detail.get("pactogrid"))
                temp = fval(detail.get("temperature") or detail.get("tempperature"))
                model = device.get("model", "Growatt SPH")

            elif device_type == 7:  # MIN / TLX
                detail = api.tlx_detail(device_sn) or {}
                d = detail.get("data") or detail  # handle nested data key
                pac = fval(d.get("pac") or d.get("ppv"))
                eday = fval(d.get("eacToday") or d.get("eday") or d.get("etoday"))
                etotal = fval(d.get("eacTotal") or d.get("etotal"))
                soc = 0
                grid_import = 0
                grid_export = pac
                temp = fval(d.get("temperature") or d.get("tempperature"))
                model = device.get("model", "Growatt MIN/TLX")
                detail = d  # use for vac/fac/vpv extraction below

            else:  # type 1 = standard inverter (most common)
                detail = api.inverter_detail(device_sn) or {}
                d = detail.get("data") or detail
                pac = fval(d.get("pac") or d.get("ppv"))
                eday = fval(d.get("eday1") or d.get("eday") or d.get("epvToday"))
                etotal = fval(d.get("etotal") or d.get("epvTotal"))
                soc = 0
                grid_import = 0
                grid_export = pac
                temp = fval(d.get("temperature") or d.get("tempperature"))
                model = device.get("model", "Growatt Inverter")
                detail = d

        except Exception as e:
            logger.warning(f"Growatt detail call failed ({e}) — using device list fields")
            pac = fval(device.get("pac") or device.get("power"))
            eday = fval(device.get("eday") or device.get("eToday") or device.get("epvToday"))
            etotal = fval(device.get("etotal") or device.get("eTotal") or device.get("epvTotal"))
            soc = grid_import = 0
            grid_export = pac
            temp = 0
            model = device.get("model", "Growatt Inverter")

        logger.info(f"Growatt parsed: pac={pac} eday={eday} etotal={etotal} soc={soc}")

        pv_strings = []
        for i in range(1, 5):
            v = fval(detail.get(f"vpv{i}", 0))
            a = fval(detail.get(f"ipv{i}", 0))
            if v > 0:
                pv_strings.append({"string": i, "voltage_v": v, "current_a": a, "power_w": v * a})

        return {
            "is_online": int(device.get("status", 0)) not in [0, 3],  # 1=online, 0=offline, 3=fault
            "current_power_w": pac * 1000 if pac < 100 else pac,
            "today_energy_kwh": eday,
            "total_energy_kwh": etotal,
            "grid_voltage_v": fval(detail.get("vac1") or detail.get("vac") or 0),
            "grid_frequency_hz": fval(detail.get("fac1") or detail.get("fac") or 0),
            "temperature_c": temp,
            "capacity_kw": fval(device.get("peak_power_actual") or device.get("capacity") or 0),
            "battery_soc": soc,
            "grid_import_w": grid_import * 1000 if 0 < grid_import < 100 else grid_import,
            "grid_export_w": grid_export * 1000 if 0 < grid_export < 100 else grid_export,
            "pv_strings": pv_strings,
            "inverter_sn": device_sn,
            "model": model,
            "station_name": device.get("name") or device.get("plantName") or f"Plant {plant_id}",
        }


# ===================== SOLIS SOLISCLOUD =====================

class SolisConnector:
    """Solis SolisCloud — HMAC-SHA256 API key authentication"""
    BASE_URL = "https://www.soliscloud.com:13333"

    def __init__(self, key_id: str, key_secret: str):
        self.key_id = key_id
        self.key_secret = key_secret

    def _sign(self, path: str, body: str) -> dict:
        md5 = base64.b64encode(hashlib.md5(body.encode()).digest()).decode()
        date = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
        sign_str = f"POST\n{md5}\napplication/json\n{date}\n{path}"
        sig = base64.b64encode(
            hmac.new(self.key_secret.encode(), sign_str.encode(), hashlib.sha1).digest()
        ).decode()
        return {
            "Content-Type": "application/json",
            "Content-MD5": md5,
            "Date": date,
            "Authorization": f"API {self.key_id}:{sig}",
        }

    def _post(self, path: str, body: dict) -> dict:
        body_str = json.dumps(body)
        headers = self._sign(path, body_str)
        resp = requests.post(f"{self.BASE_URL}{path}", headers=headers, data=body_str, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def get_plants(self) -> list:
        data = self._post("/v1/api/userStationList", {"pageNo": 1, "pageSize": 20})
        if not data.get("success"):
            raise ValueError(f"Solis plant list error: {data.get('msg', 'Unknown error')}")
        records = data.get("data", {}).get("page", {}).get("records", [])
        if not records:
            raise ValueError("No plants found on this Solis account")
        return records

    def get_plant_data(self, station_id: str) -> dict:
        data = self._post("/v1/api/stationDetail", {"id": station_id})
        if not data.get("success"):
            raise ValueError(f"Solis station detail error: {data.get('msg', 'Unknown error')}")
        d = data.get("data", {})

        # Real-time inverter data
        inv_data = self._post("/v1/api/inverterList", {"stationId": station_id, "pageNo": 1, "pageSize": 1})
        inv = {}
        if inv_data.get("success"):
            records = inv_data.get("data", {}).get("page", {}).get("records", [])
            inv = records[0] if records else {}

        pac = fval(inv.get("pac") or d.get("pac"))
        return {
            "is_online": inv.get("state", 0) == 1,
            "current_power_w": pac * 1000 if pac < 500 else pac,
            "today_energy_kwh": fval(d.get("dayEnergy") or inv.get("eToday")),
            "total_energy_kwh": fval(d.get("allEnergy") or inv.get("eTotal")),
            "grid_voltage_v": fval(inv.get("uAc1") or inv.get("uac")),
            "grid_frequency_hz": fval(inv.get("fAc1")),
            "temperature_c": fval(inv.get("inverterTemperature")),
            "capacity_kw": fval(d.get("capacity")),
            "battery_soc": fval(inv.get("batteryCapacitySoc") or inv.get("socDischargeSet")),
            "grid_import_w": fval(inv.get("psum")),
            "grid_export_w": fval(inv.get("pacToGrid")),
            "pv_strings": [],
            "inverter_sn": inv.get("sn"),
            "model": inv.get("model") or inv.get("inverterModel"),
            "station_name": d.get("stationName", f"Solis Station {station_id}"),
        }


# ===================== FRONIUS LOCAL =====================

class FroniusConnector:
    """Fronius local API — direct LAN access, no cloud"""

    def __init__(self, inverter_ip: str, device_id: int = 1):
        self.base_url = f"http://{inverter_ip.strip()}/solar_api/v1"
        self.device_id = device_id

    def get_realtime_data(self) -> dict:
        resp = requests.get(
            f"{self.base_url}/GetPowerFlowRealtimeData.fcgi",
            timeout=5
        )
        resp.raise_for_status()
        site = resp.json().get("Body", {}).get("Data", {}).get("Site", {})
        inv_data_resp = requests.get(
            f"{self.base_url}/GetInverterRealtimeData.cgi",
            params={"Scope": "Device", "DeviceId": self.device_id, "DataCollection": "CommonInverterData"},
            timeout=5
        )
        inv_body = inv_data_resp.json().get("Body", {}).get("Data", {})

        def val(d, key):
            return float((d.get(key) or {}).get("Value", 0) or 0)

        pac = fval(site.get("P_PV") or site.get("P_Load") or 0)
        return {
            "is_online": True,
            "current_power_w": abs(pac),
            "today_energy_kwh": val(inv_body, "DAY_ENERGY") / 1000,
            "total_energy_kwh": val(inv_body, "TOTAL_ENERGY") / 1000,
            "grid_voltage_v": val(inv_body, "UAC"),
            "grid_frequency_hz": val(inv_body, "FAC"),
            "temperature_c": val(inv_body, "T_AMBIENT"),
            "capacity_kw": 0,
            "battery_soc": 0,
            "grid_import_w": max(0, fval(site.get("P_Grid"))),
            "grid_export_w": max(0, -fval(site.get("P_Grid"))),
            "pv_strings": [],
            "station_name": "Fronius Inverter",
        }


# ===================== DISPATCHER =====================

def _normalize(data: dict) -> dict:
    """Ensure all required fields are present with correct types."""
    return {
        "is_online": bool(data.get("is_online", False)),
        "current_power_w": fval(data.get("current_power_w")),
        "today_energy_kwh": fval(data.get("today_energy_kwh")),
        "total_energy_kwh": fval(data.get("total_energy_kwh")),
        "grid_voltage_v": fval(data.get("grid_voltage_v")),
        "grid_frequency_hz": fval(data.get("grid_frequency_hz")),
        "temperature_c": fval(data.get("temperature_c")),
        "capacity_kw": fval(data.get("capacity_kw")),
        "battery_soc": fval(data.get("battery_soc")),
        "grid_import_w": fval(data.get("grid_import_w")),
        "grid_export_w": fval(data.get("grid_export_w")),
        "pv_strings": data.get("pv_strings") or [],
        "inverter_sn": data.get("inverter_sn"),
        "model": data.get("model"),
        "station_name": data.get("station_name", "My Station"),
    }


def test_connection_sync(brand: str, credentials: dict) -> dict:
    """Test solar connection (synchronous — run in thread)."""
    try:
        if brand == "goodwe":
            connector = SEMSConnector(credentials["username"], credentials["password"])
            connector.login()
            station_id = (credentials.get("station_id") or "").strip()
            if station_id:
                station_data = connector.get_station_data(station_id)
                name = station_data.get("station_name", "My Station")
                kw = station_data.get("current_power_w", 0) / 1000
                return {
                    "success": True,
                    "message": f"Connected! Station '{name}' — Current output: {kw:.2f} kW",
                    "stations": [{"id": station_id, "name": name, "capacity": 0}],
                }
            else:
                return {
                    "success": True,
                    "needs_station_id": True,
                    "message": "Login verified! Enter your Power Station ID to complete setup.",
                    "stations": [],
                }

        elif brand == "growatt":
            connector = GrowattConnector(credentials["api_token"])
            plants = connector.get_plants()
            plant = plants[0]
            plant_id = str(plant.get("id") or plant.get("plantId") or "")
            plant_name = plant.get("name") or plant.get("plantName") or f"Plant {plant_id}"
            return {
                "success": True,
                "message": f"Connected to Growatt! Found {len(plants)} plant(s). Using: '{plant_name}'",
                "stations": [
                    {"id": str(p.get("id") or p.get("plantId", "")),
                     "name": p.get("name") or p.get("plantName") or "Plant",
                     "capacity": fval(p.get("peak_power_actual") or p.get("nominalPower") or p.get("capacity"))}
                    for p in plants[:5]
                ],
            }

        elif brand == "solis":
            connector = SolisConnector(credentials["key_id"], credentials["key_secret"])
            plants = connector.get_plants()
            plant = plants[0]
            plant_id = str(plant.get("id") or "")
            plant_name = plant.get("stationName") or plant.get("name") or f"Station {plant_id}"
            return {
                "success": True,
                "message": f"Connected to SolisCloud! Found {len(plants)} plant(s). Using: '{plant_name}'",
                "stations": [{"id": str(p.get("id", "")), "name": p.get("stationName") or p.get("name", "Station"), "capacity": fval(p.get("capacity"))} for p in plants[:5]],
            }

        elif brand == "fronius":
            connector = FroniusConnector(credentials["inverter_ip"])
            data = connector.get_realtime_data()
            return {
                "success": True,
                "message": f"Fronius connected! Current output: {data['current_power_w']/1000:.2f} kW",
                "stations": [{"id": "local", "name": "Fronius Inverter", "capacity": 0}],
            }

        elif brand == "inverex_growatt":
            connector = GrowattConnector(credentials["api_token"])
            plants = connector.get_plants()
            plant = plants[0]
            return {
                "success": True,
                "message": f"Connected to Inverex (Growatt)! Found '{plant.get('plantName', 'Plant')}'",
                "stations": [{"id": str(p.get("id") or p.get("plantId", "")), "name": p.get("plantName") or p.get("name", "Plant"), "capacity": 0} for p in plants[:5]],
            }

        elif brand == "inverex_solis":
            # Inverex (Solis-based) — same as Solis
            connector = SolisConnector(credentials["key_id"], credentials["key_secret"])
            plants = connector.get_plants()
            plant = plants[0]
            plant_id = str(plant.get("id") or "")
            return {
                "success": True,
                "message": f"Connected to Inverex (Solis)! Found '{plant.get('stationName', plant_id)}'",
                "stations": [{"id": str(p.get("id", "")), "name": p.get("stationName", "Station"), "capacity": 0} for p in plants[:5]],
            }

        elif brand == "manual":
            return {
                "success": True,
                "message": "Manual data entry configured.",
                "stations": [{"id": "manual", "name": "Manual Entry", "capacity": 0}],
            }

        elif brand in ["huawei", "sungrow", "sma"]:
            brand_labels = {
                "huawei": "Huawei FusionSolar",
                "sungrow": "Sungrow iSolarCloud",
                "sma": "SMA Sunny Portal",
            }
            raise ValueError(
                f"{brand_labels[brand]} requires partner/OpenAPI access — "
                f"regular account credentials cannot be used. Please follow the setup guide shown in the connection wizard."
            )

        else:
            raise ValueError(f"Unknown brand: {brand}")

    except ValueError:
        raise
    except requests.exceptions.ConnectionError as e:
        raise ValueError(f"Cannot connect to {brand} portal. Check internet connection.")
    except requests.exceptions.Timeout:
        raise ValueError(f"Connection timed out. Check network access.")
    except requests.exceptions.HTTPError as e:
        raise ValueError(f"HTTP {e.response.status_code} from {brand} API: {e.response.text[:200]}")
    except Exception as e:
        msg = str(e)
        # Growatt V1 API errors come as GrowattV1ApiError with useful message
        if "plant list" in msg.lower() or "growatt" in msg.lower() or "token" in msg.lower():
            raise ValueError(f"Growatt API error: {msg}. Check your API token is correct and not expired.")
        raise ValueError(f"Unexpected error: {msg}")


def fetch_solar_live_data(connection_config: dict) -> dict:
    """Fetch real-time solar data (synchronous — run in thread)."""
    brand = connection_config.get("brand")

    if brand == "goodwe":
        c = SEMSConnector(
            connection_config["username"],
            decrypt_credential(connection_config["password_enc"])
        )
        c.login()
        return _normalize(c.get_station_data(connection_config["station_id"]))

    elif brand == "growatt" or brand == "inverex_growatt":
        c = GrowattConnector(connection_config["api_token"])
        data = _normalize(c.get_plant_data(connection_config.get("station_id", "")))
        return data

    elif brand == "solis" or brand == "inverex_solis":
        c = SolisConnector(
            decrypt_credential(connection_config["key_id_enc"]),
            decrypt_credential(connection_config["key_secret_enc"])
        )
        return _normalize(c.get_plant_data(connection_config["station_id"]))

    elif brand == "fronius":
        return _normalize(FroniusConnector(connection_config["inverter_ip"]).get_realtime_data())

    elif brand == "manual":
        return _normalize({
            "is_online": True,
            "current_power_w": float(connection_config.get("manual_power_w", 0)),
            "today_energy_kwh": float(connection_config.get("manual_today_kwh", 0)),
            "total_energy_kwh": float(connection_config.get("manual_total_kwh", 0)),
            "grid_voltage_v": 220.0,
            "grid_frequency_hz": 50.0,
            "station_name": "Manual Entry",
        })

    else:
        raise ValueError(f"Brand '{brand}' is not yet supported for live data polling.")
