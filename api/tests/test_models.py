from datetime import date
from decimal import Decimal

from models import Route, User


def test_create_user(db):
    user = User(email="test@example.com", password_hash="hashed")
    db.add(user)
    db.commit()
    db.refresh(user)

    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.password_hash == "hashed"
    assert user.created_at is not None
    assert user.routes == []


def test_user_email_unique(db):
    db.add(User(email="same@example.com", password_hash="hash1"))
    db.commit()

    db.add(User(email="same@example.com", password_hash="hash2"))
    try:
        db.commit()
        assert False, "Expected unique constraint violation"
    except Exception:
        db.rollback()


def test_create_route_without_user(db):
    route = Route(
        origin="AMS",
        destination="BCN",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
    )
    db.add(route)
    db.commit()
    db.refresh(route)

    assert route.id is not None
    assert route.user_id is None
    assert route.origin == "AMS"
    assert route.destination == "BCN"
    assert route.is_active is True
    assert route.alert_price is None


def test_create_route_with_user(db):
    user = User(email="user@example.com", password_hash="hashed")
    db.add(user)
    db.commit()

    route = Route(
        user_id=user.id,
        origin="AMS",
        destination="MAD",
        date_from=date(2026, 7, 1),
        date_to=date(2026, 7, 31),
        alert_price=Decimal("49.99"),
    )
    db.add(route)
    db.commit()
    db.refresh(route)

    assert route.user_id == user.id
    assert route.alert_price == Decimal("49.99")


def test_create_route_with_alert_price(db):
    route = Route(
        origin="DUB",
        destination="AMS",
        date_from=date(2026, 8, 1),
        date_to=date(2026, 8, 31),
        alert_price=Decimal("29.99"),
    )
    db.add(route)
    db.commit()
    db.refresh(route)

    assert route.alert_price == Decimal("29.99")


def test_user_route_relationship(db):
    user = User(email="user2@example.com", password_hash="hashed")
    db.add(user)
    db.commit()

    for dest in ["BCN", "MAD", "LIS"]:
        db.add(Route(
            user_id=user.id,
            origin="AMS",
            destination=dest,
            date_from=date(2026, 6, 1),
            date_to=date(2026, 6, 30),
        ))
    db.commit()
    db.refresh(user)

    assert len(user.routes) == 3
    assert all(r.user_id == user.id for r in user.routes)
