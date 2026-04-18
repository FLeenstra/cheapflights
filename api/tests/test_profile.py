import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock


def _register_and_token(client, email="profile@test.com", password="Secret1!"):
    res = client.post("/auth/register", json={"email": email, "password": password})
    return res.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _years_ago(n):
    return (date.today().replace(year=date.today().year - n)).isoformat()


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
        assert body["travel_children_birthdates"] == []
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
        birthdates = [_years_ago(7), _years_ago(10)]
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": "DUB",
            "travel_adults": 2,
            "travel_children_birthdates": birthdates,
            "theme_preference": "dark",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["default_origin"] == "DUB"
        assert body["travel_adults"] == 2
        assert body["travel_children_birthdates"] == birthdates
        assert body["theme_preference"] == "dark"

    def test_persisted_on_subsequent_get(self, client):
        token = _register_and_token(client, "persist@test.com")
        bd = _years_ago(5)
        client.put("/profile/", headers=auth(token), json={
            "default_origin": "BCN",
            "travel_adults": 3,
            "travel_children_birthdates": [bd],
            "theme_preference": "light",
        })
        res = client.get("/profile/", headers=auth(token))
        assert res.json()["default_origin"] == "BCN"
        assert res.json()["travel_children_birthdates"] == [bd]
        assert res.json()["theme_preference"] == "light"

    def test_clears_children_when_empty_list(self, client):
        token = _register_and_token(client, "clear@test.com")
        client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [_years_ago(5)], "theme_preference": "system",
        })
        client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [], "theme_preference": "system",
        })
        assert client.get("/profile/", headers=auth(token)).json()["travel_children_birthdates"] == []

    def test_normalises_origin_to_uppercase(self, client):
        token = _register_and_token(client, "upper@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": "dub", "travel_adults": 1,
            "travel_children_birthdates": [], "theme_preference": "system",
        })
        assert res.json()["default_origin"] == "DUB"

    def test_rejects_future_birthdate(self, client):
        token = _register_and_token(client, "future@test.com")
        future = (date.today() + timedelta(days=1)).isoformat()
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [future], "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_invalid_date_format(self, client):
        token = _register_and_token(client, "baddate@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": ["not-a-date"], "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_more_than_eight_children(self, client):
        token = _register_and_token(client, "manychildren@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [_years_ago(5)] * 9,
            "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_total_passengers_above_nine(self, client):
        token = _register_and_token(client, "total@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 5,
            "travel_children_birthdates": [_years_ago(5)] * 5,
            "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_invalid_iata_code(self, client):
        token = _register_and_token(client, "badiata@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": "INVALID", "travel_adults": 1,
            "travel_children_birthdates": [], "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_zero_adults(self, client):
        token = _register_and_token(client, "zeroadults@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 0,
            "travel_children_birthdates": [], "theme_preference": "system",
        })
        assert res.status_code == 422

    def test_rejects_invalid_theme(self, client):
        token = _register_and_token(client, "badtheme@test.com")
        res = client.put("/profile/", headers=auth(token), json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [], "theme_preference": "rainbow",
        })
        assert res.status_code == 422

    def test_accepts_all_valid_themes(self, client):
        token = _register_and_token(client, "themes@test.com")
        for theme in ("light", "dark", "system"):
            res = client.put("/profile/", headers=auth(token), json={
                "default_origin": None, "travel_adults": 1,
                "travel_children_birthdates": [], "theme_preference": theme,
            })
            assert res.status_code == 200

    def test_requires_authentication(self, client):
        res = client.put("/profile/", json={
            "default_origin": None, "travel_adults": 1,
            "travel_children_birthdates": [], "theme_preference": "system",
        })
        assert res.status_code == 401

    def test_corrupt_birthdates_in_db_returns_empty_list(self, client):
        pass  # covered by TestParseBirthdates below


# ---------------------------------------------------------------------------
# _parse_birthdates — unit tests for the internal helper
# ---------------------------------------------------------------------------

class TestParseBirthdates:

    def test_valid_json_list(self):
        from routers.profile import _parse_birthdates
        user = MagicMock()
        user.travel_children_birthdates = '["2018-05-01", "2020-03-15"]'
        assert _parse_birthdates(user) == ["2018-05-01", "2020-03-15"]

    def test_empty_json_list(self):
        from routers.profile import _parse_birthdates
        user = MagicMock()
        user.travel_children_birthdates = "[]"
        assert _parse_birthdates(user) == []

    def test_none_returns_empty_list(self):
        from routers.profile import _parse_birthdates
        user = MagicMock()
        user.travel_children_birthdates = None
        assert _parse_birthdates(user) == []

    def test_invalid_json_string_returns_empty_list(self):
        from routers.profile import _parse_birthdates
        user = MagicMock()
        user.travel_children_birthdates = "not-valid-json{{{"
        assert _parse_birthdates(user) == []

    def test_non_string_truthy_value_returns_empty_list(self):
        from routers.profile import _parse_birthdates
        user = MagicMock()
        user.travel_children_birthdates = 42  # truthy non-string → json.loads raises TypeError
        assert _parse_birthdates(user) == []
