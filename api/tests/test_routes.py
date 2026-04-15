"""
Tests for GET/POST/DELETE /routes/.
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


def test_save_route_duplicate_rejected(client):
    token = _register_and_token(client, "dup@test.com")
    payload = {
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 80,
    }
    assert client.post("/routes/", json=payload, headers=_auth(token)).status_code == 201

    # Same route, different price — must be rejected
    payload["alert_price"] = 120
    res = client.post("/routes/", json=payload, headers=_auth(token))
    assert res.status_code == 409
    assert "already" in res.json()["detail"].lower()


def test_save_route_duplicate_allowed_for_different_user(client):
    token_a = _register_and_token(client, "da@test.com")
    token_b = _register_and_token(client, "db@test.com")
    payload = {
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }
    assert client.post("/routes/", json=payload, headers=_auth(token_a)).status_code == 201
    assert client.post("/routes/", json=payload, headers=_auth(token_b)).status_code == 201


def test_save_route_same_route_different_dates_allowed(client):
    token = _register_and_token(client, "dates2@test.com")
    assert client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token)).status_code == 201
    assert client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-09-01", "date_to": "2025-09-08",
    }, headers=_auth(token)).status_code == 201


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


def test_save_route_invalid_iata_returns_422(client):
    token = _register_and_token(client, "iata@test.com")
    res = client.post("/routes/", json={
        "origin": "INVALID",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert res.status_code == 422


def test_save_route_zero_alert_price_rejected(client):
    token = _register_and_token(client, "zero@test.com")
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
        "alert_price": 0,
    }, headers=_auth(token))
    assert res.status_code == 422


def test_save_route_with_notify_available(client, db):
    token = _register_and_token(client, "notify@test.com")
    res = client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
        "notify_available": True,
    }, headers=_auth(token))
    assert res.status_code == 201
    assert db.query(Route).first().notify_available is True


def test_save_route_notify_available_defaults_false(client, db):
    token = _register_and_token(client, "notifydef@test.com")
    client.post("/routes/", json={
        "origin": "DUB",
        "destination": "BCN",
        "date_from": "2025-08-01",
        "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert db.query(Route).first().notify_available is False


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


# ---------------------------------------------------------------------------
# GET /routes/
# ---------------------------------------------------------------------------

def test_list_routes_empty(client):
    token = _register_and_token(client, "empty@test.com")
    res = client.get("/routes/", headers=_auth(token))
    assert res.status_code == 200
    assert res.json() == []


def test_list_routes_returns_own_routes(client):
    token = _register_and_token(client, "list@test.com")
    for dest in ["BCN", "MAD", "LIS"]:
        client.post("/routes/", json={
            "origin": "DUB", "destination": dest,
            "date_from": "2025-08-01", "date_to": "2025-08-08",
        }, headers=_auth(token))

    res = client.get("/routes/", headers=_auth(token))
    assert res.status_code == 200
    assert len(res.json()) == 3


def test_list_routes_response_fields(client):
    token = _register_and_token(client, "fields@test.com")
    client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 49,
    }, headers=_auth(token))

    res = client.get("/routes/", headers=_auth(token))
    r = res.json()[0]
    assert r["origin"] == "DUB"
    assert r["destination"] == "BCN"
    assert r["date_from"] == "2025-08-01"
    assert r["date_to"] == "2025-08-08"
    assert r["alert_price"] == 49
    assert r["notify_available"] is False
    assert r["is_active"] is True
    assert "id" in r
    assert "created_at" in r


def test_list_routes_excludes_other_users(client):
    token_a = _register_and_token(client, "la@test.com")
    token_b = _register_and_token(client, "lb@test.com")

    client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token_a))

    res = client.get("/routes/", headers=_auth(token_b))
    assert res.json() == []


def test_list_routes_requires_auth(client):
    res = client.get("/routes/")
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# DELETE /routes/{id}
# ---------------------------------------------------------------------------

def test_delete_route_success(client, db):
    token = _register_and_token(client, "del@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.delete(f"/routes/{route_id}", headers=_auth(token))
    assert res.status_code == 204
    assert db.query(Route).count() == 0


def test_delete_route_not_found(client):
    token = _register_and_token(client, "delnf@test.com")
    import uuid
    res = client.delete(f"/routes/{uuid.uuid4()}", headers=_auth(token))
    assert res.status_code == 404


def test_delete_route_invalid_uuid(client):
    token = _register_and_token(client, "delinv@test.com")
    res = client.delete("/routes/not-a-uuid", headers=_auth(token))
    assert res.status_code == 404


def test_delete_route_wrong_user(client, db):
    token_owner = _register_and_token(client, "owner@test.com")
    token_other = _register_and_token(client, "other@test.com")

    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token_owner))
    route_id = save_res.json()["id"]

    res = client.delete(f"/routes/{route_id}", headers=_auth(token_other))
    assert res.status_code == 404
    assert db.query(Route).count() == 1


def test_delete_route_requires_auth(client):
    res = client.delete("/routes/some-id")
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# PUT /routes/{id}
# ---------------------------------------------------------------------------

def test_update_route_success(client, db):
    token = _register_and_token(client, "upd@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 50,
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "AMS", "destination": "MAD",
        "date_from": "2025-09-01", "date_to": "2025-09-08",
        "alert_price": 80,
    }, headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["id"] == route_id

    route = db.query(Route).first()
    assert route.origin == "AMS"
    assert route.destination == "MAD"
    assert int(route.alert_price) == 80


def test_update_route_sets_notify_available(client, db):
    token = _register_and_token(client, "updnotify@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "notify_available": True,
    }, headers=_auth(token))
    assert res.status_code == 200
    assert db.query(Route).first().notify_available is True


def test_update_route_clears_notify_available(client, db):
    token = _register_and_token(client, "updnotifyclr@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "notify_available": True,
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "notify_available": False,
    }, headers=_auth(token))
    assert res.status_code == 200
    assert db.query(Route).first().notify_available is False


def test_update_route_clears_alert_price(client, db):
    token = _register_and_token(client, "updclr@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 50,
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert res.status_code == 200
    assert db.query(Route).first().alert_price is None


def test_update_route_not_found(client):
    token = _register_and_token(client, "updnf@test.com")
    import uuid
    res = client.put(f"/routes/{uuid.uuid4()}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert res.status_code == 404


def test_update_route_invalid_uuid(client):
    token = _register_and_token(client, "updinv@test.com")
    res = client.put("/routes/not-a-uuid", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert res.status_code == 404


def test_update_route_wrong_user(client, db):
    token_owner = _register_and_token(client, "updowner@test.com")
    token_other = _register_and_token(client, "updother@test.com")

    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token_owner))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "AMS", "destination": "MAD",
        "date_from": "2025-09-01", "date_to": "2025-09-08",
    }, headers=_auth(token_other))
    assert res.status_code == 404
    assert db.query(Route).first().origin == "DUB"


def test_update_route_duplicate_rejected(client):
    token = _register_and_token(client, "upddup@test.com")
    client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    save_res = client.post("/routes/", json={
        "origin": "AMS", "destination": "MAD",
        "date_from": "2025-09-01", "date_to": "2025-09-08",
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    # Try to update second route to clash with first
    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    assert res.status_code == 409
    assert "already" in res.json()["detail"].lower()


def test_update_route_same_values_allowed(client):
    """Updating a route to its own current values must not trigger the duplicate check."""
    token = _register_and_token(client, "updsame@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 50,
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
        "alert_price": 75,
    }, headers=_auth(token))
    assert res.status_code == 200


def test_update_route_date_from_after_date_to(client):
    token = _register_and_token(client, "upddates@test.com")
    save_res = client.post("/routes/", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    }, headers=_auth(token))
    route_id = save_res.json()["id"]

    res = client.put(f"/routes/{route_id}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-10", "date_to": "2025-08-01",
    }, headers=_auth(token))
    assert res.status_code == 400


def test_update_route_requires_auth(client):
    import uuid
    res = client.put(f"/routes/{uuid.uuid4()}", json={
        "origin": "DUB", "destination": "BCN",
        "date_from": "2025-08-01", "date_to": "2025-08-08",
    })
    assert res.status_code in (401, 403)
