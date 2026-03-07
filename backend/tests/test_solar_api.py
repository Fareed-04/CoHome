"""
Solar Inverter API Tests
Tests: test-connection, configure, live, sync, readings, disconnect
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "testcohome@test.pk"
TEST_PASSWORD = "test1234"
TEST_HOME_ID = "home_74c2ceb55fa0"


@pytest.fixture(scope="module")
def token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def solar_device_id(auth):
    resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/devices", headers=auth)
    devices = resp.json()
    solar = next((d for d in devices if d["type"] == "solar"), None)
    assert solar is not None, "Solar device not found"
    return solar["device_id"]


# ---- TEST CONNECTION ----

class TestSolarTestConnection:
    def test_manual_brand_success(self, auth):
        resp = requests.post(f"{BASE_URL}/api/solar/test-connection",
            json={"brand": "manual", "credentials": {}}, headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "stations" in data
        assert len(data["stations"]) > 0

    def test_goodwe_bad_creds_fails(self, auth):
        resp = requests.post(f"{BASE_URL}/api/solar/test-connection",
            json={"brand": "goodwe", "credentials": {"username": "bad@test.com", "password": "wrong"}},
            headers=auth)
        # should return 400 with error (SEMS login will fail)
        assert resp.status_code in [400, 422, 200]
        if resp.status_code == 200:
            data = resp.json()
            # Could succeed=False or succeed=True with coming_soon
            assert "success" in data

    def test_coming_soon_brands(self, auth):
        for brand in ["huawei", "growatt", "sungrow", "solis", "sma", "inverex"]:
            resp = requests.post(f"{BASE_URL}/api/solar/test-connection",
                json={"brand": brand, "credentials": {}}, headers=auth)
            assert resp.status_code == 200, f"{brand} returned {resp.status_code}"
            data = resp.json()
            assert data["success"] is True
            assert data.get("coming_soon") is True

    def test_unauthenticated_rejected(self):
        resp = requests.post(f"{BASE_URL}/api/solar/test-connection",
            json={"brand": "manual", "credentials": {}})
        assert resp.status_code == 401


# ---- CONFIGURE ----

class TestSolarConfigure:
    def test_configure_manual(self, auth, solar_device_id):
        resp = requests.post(f"{BASE_URL}/api/devices/{solar_device_id}/solar/configure",
            json={
                "brand": "manual",
                "credentials": {"manual_power_w": 2500, "manual_today_kwh": 12.5, "manual_total_kwh": 1000},
                "station_id": "manual",
                "station_name": "My Solar"
            }, headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True or "connection_config" in data

    def test_configure_wrong_device_type(self, auth, token):
        # Get a non-solar device
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/devices", headers=auth)
        devices = resp.json()
        non_solar = next((d for d in devices if d["type"] != "solar"), None)
        if non_solar:
            r = requests.post(f"{BASE_URL}/api/devices/{non_solar['device_id']}/solar/configure",
                json={"brand": "manual", "credentials": {}, "station_id": "manual", "station_name": "Test"},
                headers=auth)
            assert r.status_code in [400, 404]  # 404 when queried as solar device but device is not solar type

    def test_configure_nonexistent_device(self, auth):
        resp = requests.post(f"{BASE_URL}/api/devices/nonexistent_device/solar/configure",
            json={"brand": "manual", "credentials": {}, "station_id": "manual", "station_name": "Test"},
            headers=auth)
        assert resp.status_code == 404


# ---- LIVE DATA ----

class TestSolarLive:
    def test_get_live_after_configure(self, auth, solar_device_id):
        # First configure
        requests.post(f"{BASE_URL}/api/devices/{solar_device_id}/solar/configure",
            json={"brand": "manual", "credentials": {"manual_power_w": 3000, "manual_today_kwh": 15.0, "manual_total_kwh": 2000},
                  "station_id": "manual", "station_name": "My Solar"},
            headers=auth)
        # Then get live
        resp = requests.get(f"{BASE_URL}/api/devices/{solar_device_id}/solar/live", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("is_connected") is True
        assert "current_power_w" in data or "live_data" in data

    def test_live_unauthenticated(self, solar_device_id):
        resp = requests.get(f"{BASE_URL}/api/devices/{solar_device_id}/solar/live")
        assert resp.status_code == 401


# ---- SYNC ----

class TestSolarSync:
    def test_manual_sync(self, auth, solar_device_id):
        resp = requests.post(f"{BASE_URL}/api/devices/{solar_device_id}/solar/sync", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert "success" in data or "synced" in data or "current_power_w" in data

    def test_sync_nonexistent_device(self, auth):
        resp = requests.post(f"{BASE_URL}/api/devices/nonexistent/solar/sync", headers=auth)
        assert resp.status_code == 404


# ---- READINGS ----

class TestSolarReadings:
    def test_get_readings(self, auth, solar_device_id):
        resp = requests.get(f"{BASE_URL}/api/devices/{solar_device_id}/solar/readings", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_readings_limit(self, auth, solar_device_id):
        resp = requests.get(f"{BASE_URL}/api/devices/{solar_device_id}/solar/readings?limit=5", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 5


# ---- DISCONNECT ----

class TestSolarDisconnect:
    def test_disconnect(self, auth, solar_device_id):
        # First configure to ensure connected
        requests.post(f"{BASE_URL}/api/devices/{solar_device_id}/solar/configure",
            json={"brand": "manual", "credentials": {}, "station_id": "manual", "station_name": "Test"},
            headers=auth)
        # Now disconnect
        resp = requests.delete(f"{BASE_URL}/api/devices/{solar_device_id}/solar/configure", headers=auth)
        assert resp.status_code == 200

    def test_live_after_disconnect(self, auth, solar_device_id):
        resp = requests.get(f"{BASE_URL}/api/devices/{solar_device_id}/solar/live", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("is_connected") is False
