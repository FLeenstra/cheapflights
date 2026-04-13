import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from jose import jwt

from models import PasswordResetToken
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


# ---------------------------------------------------------------------------
# Forgot password
# ---------------------------------------------------------------------------

def test_forgot_password_registered_email_returns_200(client):
    """Always returns 200 regardless of whether the email is registered."""
    client.post("/auth/register", json={"email": "reset@test.com", "password": "Secret1!"})
    with patch("routers.auth._send_reset_email") as mock_send:
        res = client.post("/auth/forgot-password", json={"email": "reset@test.com"})
    assert res.status_code == 200
    assert "message" in res.json()
    mock_send.assert_called_once()


def test_forgot_password_unknown_email_returns_200(client):
    """Does not reveal whether an email is registered."""
    with patch("routers.auth._send_reset_email") as mock_send:
        res = client.post("/auth/forgot-password", json={"email": "nobody@test.com"})
    assert res.status_code == 200
    assert "message" in res.json()
    mock_send.assert_not_called()


def test_forgot_password_stores_token(client, db):
    client.post("/auth/register", json={"email": "tokencheck@test.com", "password": "Secret1!"})
    with patch("routers.auth._send_reset_email"):
        client.post("/auth/forgot-password", json={"email": "tokencheck@test.com"})
    token_row = db.query(PasswordResetToken).first()
    assert token_row is not None
    assert token_row.used is False
    # SQLite may return naive datetimes; strip tz for comparison
    expires = token_row.expires_at.replace(tzinfo=None)
    assert expires > datetime.now()


def test_forgot_password_invalidates_previous_token(client, db):
    client.post("/auth/register", json={"email": "multi@test.com", "password": "Secret1!"})
    with patch("routers.auth._send_reset_email"):
        client.post("/auth/forgot-password", json={"email": "multi@test.com"})
        client.post("/auth/forgot-password", json={"email": "multi@test.com"})
    tokens = db.query(PasswordResetToken).all()
    used = [t for t in tokens if t.used]
    active = [t for t in tokens if not t.used]
    assert len(used) == 1
    assert len(active) == 1


def test_forgot_password_invalid_email_format(client):
    res = client.post("/auth/forgot-password", json={"email": "not-an-email"})
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------

def test_reset_password_success(client, db):
    client.post("/auth/register", json={"email": "chpw@test.com", "password": "OldPass1!"})

    with patch("routers.auth._send_reset_email") as mock_send:
        client.post("/auth/forgot-password", json={"email": "chpw@test.com"})
        reset_url = mock_send.call_args[0][1]
    token = reset_url.split("token=")[1]

    res = client.post("/auth/reset-password", json={"token": token, "password": "NewPass1!"})
    assert res.status_code == 200
    assert "message" in res.json()

    # Old password no longer works
    login_old = client.post("/auth/login", json={"email": "chpw@test.com", "password": "OldPass1!"})
    assert login_old.status_code == 401

    # New password works
    login_new = client.post("/auth/login", json={"email": "chpw@test.com", "password": "NewPass1!"})
    assert login_new.status_code == 200


def test_reset_password_token_marked_used(client, db):
    client.post("/auth/register", json={"email": "usedtoken@test.com", "password": "Secret1!"})

    with patch("routers.auth._send_reset_email") as mock_send:
        client.post("/auth/forgot-password", json={"email": "usedtoken@test.com"})
        token = mock_send.call_args[0][1].split("token=")[1]

    client.post("/auth/reset-password", json={"token": token, "password": "NewPass1!"})

    # Second use of the same token must fail
    res = client.post("/auth/reset-password", json={"token": token, "password": "AnotherPass1!"})
    assert res.status_code == 400


def test_reset_password_invalid_token(client):
    res = client.post("/auth/reset-password", json={"token": "completely-fake-token", "password": "NewPass1!"})
    assert res.status_code == 400
    assert "invalid" in res.json()["detail"].lower()


def test_reset_password_expired_token(client, db):
    client.post("/auth/register", json={"email": "expired@test.com", "password": "Secret1!"})

    with patch("routers.auth._send_reset_email") as mock_send:
        client.post("/auth/forgot-password", json={"email": "expired@test.com"})
        token = mock_send.call_args[0][1].split("token=")[1]

    # Manually expire the token in the DB
    token_row = db.query(PasswordResetToken).filter(PasswordResetToken.token == token).first()
    token_row.expires_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db.commit()

    res = client.post("/auth/reset-password", json={"token": token, "password": "NewPass1!"})
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# _send_reset_email helper
# ---------------------------------------------------------------------------

def test_send_reset_email_no_smtp_logs_url(capsys):
    from routers.auth import _send_reset_email
    with patch.dict("os.environ", {}, clear=False):
        # Ensure SMTP_HOST is not set
        import os
        os.environ.pop("SMTP_HOST", None)
        _send_reset_email("user@test.com", "http://localhost:5173/reset-password?token=abc")
    captured = capsys.readouterr()
    assert "http://localhost:5173/reset-password?token=abc" in captured.out


def test_send_reset_email_smtp_called(capsys):
    from routers.auth import _send_reset_email
    env = {"SMTP_HOST": "smtp.example.com", "SMTP_PORT": "587",
           "SMTP_USER": "user", "SMTP_PASSWORD": "pass", "SMTP_FROM": "noreply@example.com"}
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    with patch.dict("os.environ", env):
        with patch("routers.auth.smtplib.SMTP", return_value=mock_smtp):
            _send_reset_email("user@test.com", "http://localhost:5173/reset-password?token=abc")
    mock_smtp.starttls.assert_called_once()
    mock_smtp.login.assert_called_once_with("user", "pass")
    mock_smtp.send_message.assert_called_once()


def test_send_reset_email_smtp_failure_logs_fallback(capsys):
    from routers.auth import _send_reset_email
    env = {"SMTP_HOST": "smtp.broken.com", "SMTP_PORT": "587", "SMTP_USER": "", "SMTP_PASSWORD": ""}
    with patch.dict("os.environ", env):
        with patch("routers.auth.smtplib.SMTP", side_effect=ConnectionRefusedError("refused")):
            _send_reset_email("user@test.com", "http://localhost:5173/reset-password?token=xyz")
    captured = capsys.readouterr()
    assert "http://localhost:5173/reset-password?token=xyz" in captured.out
