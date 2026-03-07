"""
Cohome Backend API Tests
Tests: Auth, Homes, Devices, Alerts, Members, Subscription, Stats
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "testcohome@test.pk"
TEST_PASSWORD = "test1234"
TEST_HOME_ID = "home_74c2ceb55fa0"

# New user for registration test
NEW_USER_EMAIL = "TEST_newcohome@test.pk"
NEW_USER_PASSWORD = "test1234"
NEW_USER_NAME = "TEST NewUser"


@pytest.fixture(scope="module")
def token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- AUTH ----

class TestAuth:
    def test_login_success(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL

    def test_login_invalid(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": "wrongpass"})
        assert resp.status_code == 401

    def test_register_new_user(self):
        # Cleanup first in case it exists
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": NEW_USER_EMAIL, "password": NEW_USER_PASSWORD})
        # Proceed with registration (may fail if already exists - that's ok)
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": NEW_USER_EMAIL, "password": NEW_USER_PASSWORD, "name": NEW_USER_NAME
        })
        assert resp.status_code in [200, 400]  # 400 if already exists
        if resp.status_code == 200:
            data = resp.json()
            assert "token" in data
            assert "user" in data

    def test_auth_me(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == TEST_EMAIL
        assert "password_hash" not in data

    def test_auth_me_no_token(self):
        resp = requests.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 401


# ---- HOMES ----

class TestHomes:
    def test_get_homes(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        home_ids = [h["home_id"] for h in data]
        assert TEST_HOME_ID in home_ids

    def test_get_single_home(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["home_id"] == TEST_HOME_ID

    def test_create_and_delete_home(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/homes", json={
            "name": "TEST Home", "address": "123 Test St", "city": "Lahore"
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "home_id" in data
        new_home_id = data["home_id"]

        # Verify devices seeded
        dev_resp = requests.get(f"{BASE_URL}/api/homes/{new_home_id}/devices", headers=auth_headers)
        assert dev_resp.status_code == 200
        devices = dev_resp.json()
        assert len(devices) == 7

        # Delete
        del_resp = requests.delete(f"{BASE_URL}/api/homes/{new_home_id}", headers=auth_headers)
        assert del_resp.status_code == 200


# ---- DEVICES ----

class TestDevices:
    def test_get_devices(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/devices", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 7
        types = [d["type"] for d in data]
        assert "solar" in types
        assert "camera" in types
        assert "door" in types
        assert "gate" in types
        assert "doorbell" in types
        assert "geyser" in types

    def test_toggle_device(self, auth_headers):
        # Get devices first
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/devices", headers=auth_headers)
        devices = resp.json()
        geyser = next((d for d in devices if d["type"] == "geyser"), None)
        assert geyser is not None

        original_state = geyser["is_on"]
        device_id = geyser["device_id"]

        toggle_resp = requests.patch(f"{BASE_URL}/api/devices/{device_id}/toggle", headers=auth_headers)
        assert toggle_resp.status_code == 200
        data = toggle_resp.json()
        assert data["is_on"] == (not original_state)

        # Toggle back
        requests.patch(f"{BASE_URL}/api/devices/{device_id}/toggle", headers=auth_headers)

    def test_solar_analytics(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/devices", headers=auth_headers)
        devices = resp.json()
        solar = next((d for d in devices if d["type"] == "solar"), None)
        assert solar is not None

        for period in ["24h", "7d", "30d"]:
            ana_resp = requests.get(
                f"{BASE_URL}/api/devices/{solar['device_id']}/analytics?period={period}",
                headers=auth_headers
            )
            assert ana_resp.status_code == 200
            ana_data = ana_resp.json()
            assert "data" in ana_data
            assert "summary" in ana_data


# ---- ALERTS ----

class TestAlerts:
    def test_get_alerts(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/alerts", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_home_alerts(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/alerts", headers=auth_headers)
        assert resp.status_code == 200

    def test_mark_all_read(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/alerts/mark-all-read", headers=auth_headers)
        assert resp.status_code == 200


# ---- STATS ----

class TestStats:
    def test_home_stats(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/homes/{TEST_HOME_ID}/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_devices" in data
        assert data["total_devices"] >= 7
        assert "solar_battery" in data


# ---- SUBSCRIPTION ----

class TestSubscription:
    def test_get_subscription(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/subscription", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "plan" in data
        assert data["plan"] in ["free", "pro"]
