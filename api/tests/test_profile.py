import pytest


def _register_and_token(client, email="profile@test.com", password="Secret1!"):
    res = client.post("/auth/register", json={"email": email, "password": password})
    return res.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# GET /profile/
# ---------------------------------------------------------------------------

class TestGetProfile:

    def test_returns_defaults_for_new_user(self, client):
        token = _register_and_token(client)
        res = client.get("/profile/", headers=auth(token))
        assert res.status_code == 200
        body = res.json()
        assert body["default_origin"] is None
        assert body["travel_adults"] == 1
        assert body["travel_children"] == 0
        assert body["theme_preference"] == "system"

    def test_requires_authentication(self, client):
        res = client.get("/profile/")
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# PUT /profile/
# ---------------------------------------------------------------------------

class TestUpdateProfile:

    def test_saves_all_fields(self, client):
        token = _register_and_token(client, "update@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": "DUB",
            "travel_adults": 2,
            "travel_children": 1,
            "theme_preference": "dark",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["default_origin"] == "DUB"
        assert body["travel_adults"] == 2
        assert body["travel_children"] == 1
        assert body["theme_preference"] == "dark"

    def test_persisted_on_subsequent_get(self, client):
        token = _register_and_token(client, "persist@test.com")
        client.put("/profile/", headers=auth(token), json={
            "default_origin": "BCN",
            "travel_adults": 3,
            "travel_children": 0,
            "theme_preference": "light",
        })
        res = client.get("/profile/", headers=auth(token))
        assert res.json()["default_origin"] == "BCN"
        assert res.json()["travel_adults"] == 3
        assert res.json()["theme_preference"] == "light"

    def test_clears_default_origin_when_null(self, client):
        token = _register_and_token(client, "clear@test.com")
        client.put("/profile/", headers=auth(token), json={"default_origin": "DUB", "travel_adults": 1, "travel_children": 0, "theme_preference": "system"})
        client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 1, "travel_children": 0, "theme_preference": "system"})
        res = client.get("/profile/", headers=auth(token))
        assert res.json()["default_origin"] is None

    def test_normalises_origin_to_uppercase(self, client):
        token = _register_and_token(client, "upper@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": "dub", "travel_adults": 1, "travel_children": 0, "theme_preference": "system"})
        assert res.json()["default_origin"] == "DUB"

    def test_rejects_invalid_iata_code(self, client):
        token = _register_and_token(client, "badiata@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": "INVALID", "travel_adults": 1, "travel_children": 0, "theme_preference": "system"})
        assert res.status_code == 422

    def test_rejects_zero_adults(self, client):
        token = _register_and_token(client, "zeroadults@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 0, "travel_children": 0, "theme_preference": "system"})
        assert res.status_code == 422

    def test_rejects_adults_above_nine(self, client):
        token = _register_and_token(client, "toomany@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 10, "travel_children": 0, "theme_preference": "system"})
        assert res.status_code == 422

    def test_rejects_total_passengers_above_nine(self, client):
        token = _register_and_token(client, "total@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 5, "travel_children": 5, "theme_preference": "system"})
        assert res.status_code == 422

    def test_rejects_invalid_theme(self, client):
        token = _register_and_token(client, "badtheme@test.com")
        res = client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 1, "travel_children": 0, "theme_preference": "rainbow"})
        assert res.status_code == 422

    def test_accepts_all_valid_themes(self, client):
        token = _register_and_token(client, "themes@test.com")
        for theme in ("light", "dark", "system"):
            res = client.put("/profile/", headers=auth(token), json={"default_origin": None, "travel_adults": 1, "travel_children": 0, "theme_preference": theme})
            assert res.status_code == 200

    def test_requires_authentication(self, client):
        res = client.put("/profile/", json={"default_origin": None, "travel_adults": 1, "travel_children": 0, "theme_preference": "system"})
        assert res.status_code == 401
