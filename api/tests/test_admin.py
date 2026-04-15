"""
Tests for GET /admin/users, GET /admin/logs, POST /admin/run-check.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from models import Route, RouteCheckLog, User

_FUTURE_FROM = (date.today() + timedelta(days=30)).isoformat()
_FUTURE_TO   = (date.today() + timedelta(days=37)).isoformat()


def _register(client, email, password="Secret1!"):
    res = client.post("/auth/register", json={"email": email, "password": password})
    return res.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _admin_token(client):
    return _register(client, "admin@elcheeapo.com")


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

def test_me_returns_user_info(client):
    token = _register(client, "me@test.com")
    res = client.get("/auth/me", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "me@test.com"
    assert data["is_admin"] is False
    assert "id" in data


def test_me_admin_flag_true_for_admin(client):
    token = _admin_token(client)
    res = client.get("/auth/me", headers=_auth(token))
    assert res.json()["is_admin"] is True


def test_me_requires_auth(client):
    res = client.get("/auth/me")
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Admin auth guard
# ---------------------------------------------------------------------------

def test_non_admin_cannot_list_users(client):
    token = _register(client, "nonadmin@test.com")
    res = client.get("/admin/users", headers=_auth(token))
    assert res.status_code == 403


def test_non_admin_cannot_list_logs(client):
    token = _register(client, "nonadmin2@test.com")
    res = client.get("/admin/logs", headers=_auth(token))
    assert res.status_code == 403


def test_non_admin_cannot_run_check(client):
    token = _register(client, "nonadmin3@test.com")
    res = client.post("/admin/run-check", headers=_auth(token))
    assert res.status_code == 403


def test_unauthenticated_cannot_access_admin(client):
    assert client.get("/admin/users").status_code in (401, 403)
    assert client.get("/admin/logs").status_code in (401, 403)
    assert client.post("/admin/run-check").status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /admin/users
# ---------------------------------------------------------------------------

def test_list_users_returns_all_users(client, db):
    admin_token = _admin_token(client)
    _register(client, "alice@test.com")
    _register(client, "bob@test.com")

    res = client.get("/admin/users", headers=_auth(admin_token))
    assert res.status_code == 200
    emails = {u["email"] for u in res.json()}
    assert "alice@test.com" in emails
    assert "bob@test.com" in emails


def test_list_users_includes_route_count(client, db):
    admin_token = _admin_token(client)
    user_token = _register(client, "counter@test.com")

    for dest in ["BCN", "MAD"]:
        client.post("/routes/", json={
            "origin": "DUB", "destination": dest,
            "date_from": _FUTURE_FROM, "date_to": _FUTURE_TO,
        }, headers=_auth(user_token))

    res = client.get("/admin/users", headers=_auth(admin_token))
    users = {u["email"]: u for u in res.json()}
    assert users["counter@test.com"]["route_count"] == 2


def test_list_users_zero_routes_for_new_user(client):
    admin_token = _admin_token(client)
    _register(client, "empty@test.com")

    res = client.get("/admin/users", headers=_auth(admin_token))
    users = {u["email"]: u for u in res.json()}
    assert users["empty@test.com"]["route_count"] == 0


def test_list_users_response_fields(client):
    admin_token = _admin_token(client)
    res = client.get("/admin/users", headers=_auth(admin_token))
    u = res.json()[0]
    assert "id" in u
    assert "email" in u
    assert "created_at" in u
    assert "route_count" in u


# ---------------------------------------------------------------------------
# GET /admin/logs
# ---------------------------------------------------------------------------

def test_list_logs_empty(client):
    admin_token = _admin_token(client)
    res = client.get("/admin/logs", headers=_auth(admin_token))
    assert res.status_code == 200
    assert res.json() == []


def test_list_logs_returns_logs_with_route_info(client, db):
    admin_token = _admin_token(client)
    user_token = _register(client, "logroute@test.com")

    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": _FUTURE_FROM, "date_to": _FUTURE_TO,
        "alert_price": 100,
    }, headers=_auth(user_token))
    route_id = save_res.json()["id"]

    from models import Route as RouteModel
    import uuid as uuid_module
    route = db.query(RouteModel).filter(RouteModel.id == uuid_module.UUID(route_id)).first()
    log = RouteCheckLog(
        route_id=route.id,
        outbound_price=Decimal("29.99"),
        inbound_price=Decimal("34.99"),
        total_price=Decimal("64.98"),
        flights_found=True,
        price_goal_reached=False,
        available_goal_reached=False,
    )
    db.add(log)
    db.commit()

    res = client.get("/admin/logs", headers=_auth(admin_token))
    assert res.status_code == 200
    assert len(res.json()) == 1
    entry = res.json()[0]
    assert entry["origin"] == "DUB"
    assert entry["destination"] == "BCN"
    assert entry["outbound_price"] == 29.99
    assert entry["total_price"] == 64.98
    assert entry["flights_found"] is True
    assert entry["price_goal_reached"] is False


def test_list_logs_response_fields(client, db):
    admin_token = _admin_token(client)
    user_token = _register(client, "logfields@test.com")
    save_res = client.post("/routes/", json={
        "origin": "AMS", "destination": "MAD",
        "date_from": _FUTURE_FROM, "date_to": _FUTURE_TO,
    }, headers=_auth(user_token))
    route_id = save_res.json()["id"]

    import uuid as uuid_module
    route = db.query(Route).filter(Route.id == uuid_module.UUID(route_id)).first()
    db.add(RouteCheckLog(route_id=route.id, error="timeout"))
    db.commit()

    entry = client.get("/admin/logs", headers=_auth(admin_token)).json()[0]
    for field in ("id", "route_id", "origin", "destination", "date_from", "date_to",
                  "checked_at", "flights_found", "price_goal_reached",
                  "available_goal_reached", "error"):
        assert field in entry
    assert entry["error"] == "timeout"


def test_list_logs_capped_at_200(client, db):
    admin_token = _admin_token(client)
    user_token = _register(client, "cap@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": _FUTURE_FROM, "date_to": _FUTURE_TO,
    }, headers=_auth(user_token))

    import uuid as uuid_module
    route = db.query(Route).filter(
        Route.id == uuid_module.UUID(save_res.json()["id"])
    ).first()
    for _ in range(210):
        db.add(RouteCheckLog(route_id=route.id))
    db.commit()

    res = client.get("/admin/logs", headers=_auth(admin_token))
    assert len(res.json()) == 200


# ---------------------------------------------------------------------------
# POST /admin/run-check
# ---------------------------------------------------------------------------

def test_run_check_triggers_scheduler(client):
    admin_token = _admin_token(client)
    with patch("routers.admin.check_routes", return_value=3) as mock_check:
        res = client.post("/admin/run-check", headers=_auth(admin_token))
    assert res.status_code == 200
    assert res.json()["routes_checked"] == 3
    assert res.json()["message"] == "Check complete"
    mock_check.assert_called_once()


def test_run_check_zero_routes(client):
    admin_token = _admin_token(client)
    with patch("routers.admin.check_routes", return_value=0):
        res = client.post("/admin/run-check", headers=_auth(admin_token))
    assert res.json()["routes_checked"] == 0
