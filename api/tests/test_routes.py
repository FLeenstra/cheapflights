"""
Tests for POST /routes/ — save a route search.
"""
import pytest
from models import Route


def _register_and_token(client, email="user@test.com", password="Secret1!"):
    res = client.post("/auth/register", json={"email": email, "password": password})
    return res.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_save_route_without_alert_price(client, db):
    token = _register_and_token(client)
    res = client.post("/routes/", json={
        "origin": "dub",
        "destination": "bcn",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    }, headers=_auth(token))

    assert res.status_code == 201
    assert "id" in res.json()

    route = db.query(Route).first()
    assert route.origin == "DUB"
    assert route.destination == "BCN"
    assert route.alert_price is None
    assert route.is_active is True


def test_save_route_with_alert_price(client, db):
    token = _register_and_token(client, "alert@test.com")
    res = client.post("/routes/", json={
        "origin": "AMS",
        "destination": "MAD",
        "date_from": "2025-09-01",
        "date_to": "2025-09-08",
        "alert_price": 49,
    }, headers=_auth(token))

    assert res.status_code == 201
    route = db.query(Route).first()
    assert int(route.alert_price) == 49


def test_save_route_iata_codes_uppercased(client, db):
    token = _register_and_token(client, "upper@test.com")
    client.post("/routes/", json={
        "origin": "ltn",
        "destination": "opo",
        "date_from": "2025-10-01",
        "date_to": "2025-10-07",
    }, headers=_auth(token))

    route = db.query(Route).first()
    assert route.origin == "LTN"
    assert route.destination == "OPO"


def test_save_route_linked_to_user(client, db):
    token = _register_and_token(client, "linked@test.com")
    client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    }, headers=_auth(token))

    from models import User
    user = db.query(User).filter(User.email == "linked@test.com").first()
    route = db.query(Route).first()
    assert route.user_id == user.id


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_save_route_date_from_after_date_to(client):
    token = _register_and_token(client, "dates@test.com")
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-10",
        "date_to": "2025-08-01",
    }, headers=_auth(token))
    assert res.status_code == 400
    assert "date_from" in res.json()["detail"].lower()


def test_save_route_missing_fields(client):
    token = _register_and_token(client, "missing@test.com")
    res = client.post("/routes/", json={"origin": "DUB"}, headers=_auth(token))
    assert res.status_code == 422


def test_save_route_decimal_alert_price_rejected(client):
    token = _register_and_token(client, "decimal@test.com")
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
        "alert_price": 49.99,
    }, headers=_auth(token))
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_save_route_requires_auth(client):
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    })
    assert res.status_code in (401, 403)


def test_save_route_invalid_token(client):
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    }, headers={"Authorization": "Bearer totally.fake.token"})
    assert res.status_code == 401


def test_save_route_each_user_sees_only_own_routes(client, db):
    token_a = _register_and_token(client, "a@test.com")
    token_b = _register_and_token(client, "b@test.com")

    client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token_a))
    client.post("/routes/", json={
        "origin": "AMS", "destination": "MAD",
        "date_from": "2025-09-01", "date_to": "2025-09-08",
    }, headers=_auth(token_b))

    from models import User
    user_a = db.query(User).filter(User.email == "a@test.com").first()
    user_b = db.query(User).filter(User.email == "b@test.com").first()

    routes_a = db.query(Route).filter(Route.user_id == user_a.id).all()
    routes_b = db.query(Route).filter(Route.user_id == user_b.id).all()

    assert len(routes_a) == 1 and routes_a[0].origin == "DUB"
    assert len(routes_b) == 1 and routes_b[0].origin == "AMS"
