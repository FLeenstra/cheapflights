import pytest
from jose import jwt

from routers.auth import SECRET_KEY, ALGORITHM


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def test_register_success(client):
    res = client.post("/auth/register", json={"email": "user@test.com", "password": "Secret1!"})
    assert res.status_code == 201
    body = res.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    # Token must be a valid JWT with the expected algorithm
    payload = jwt.decode(body["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert "sub" in payload


def test_register_duplicate_email(client):
    payload = {"email": "dup@test.com", "password": "Secret1!"}
    client.post("/auth/register", json=payload)
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"].lower()


def test_register_invalid_email(client):
    res = client.post("/auth/register", json={"email": "not-an-email", "password": "Secret1!"})
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_success(client):
    client.post("/auth/register", json={"email": "login@test.com", "password": "MyPass99!"})
    res = client.post("/auth/login", json={"email": "login@test.com", "password": "MyPass99!"})
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client):
    client.post("/auth/register", json={"email": "pw@test.com", "password": "Correct1!"})
    res = client.post("/auth/login", json={"email": "pw@test.com", "password": "WrongPass!"})
    assert res.status_code == 401
    assert "invalid" in res.json()["detail"].lower()


def test_login_nonexistent_user(client):
    res = client.post("/auth/login", json={"email": "ghost@test.com", "password": "whatever"})
    assert res.status_code == 401


def test_login_invalid_email_format(client):
    res = client.post("/auth/login", json={"email": "bad-email", "password": "whatever"})
    assert res.status_code == 422
