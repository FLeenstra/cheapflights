from datetime import date, datetime, timezone
from decimal import Decimal

from models import Alert, Flight, Route, User


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


def test_create_flight(db):
    route = Route(
        origin="AMS",
        destination="BCN",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
    )
    db.add(route)
    db.commit()

    departure = datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc)
    arrival = datetime(2026, 6, 15, 12, 30, tzinfo=timezone.utc)

    flight = Flight(
        route_id=route.id,
        flight_number="FR1234",
        price=Decimal("39.99"),
        currency="EUR",
        departure_time=departure,
        arrival_time=arrival,
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)

    assert flight.id is not None
    assert flight.route_id == route.id
    assert flight.flight_number == "FR1234"
    assert flight.price == Decimal("39.99")
    assert flight.currency == "EUR"
    assert flight.scraped_at is not None


def test_create_alert(db):
    route = Route(
        origin="AMS",
        destination="BCN",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
        alert_price=Decimal("50.00"),
    )
    db.add(route)
    db.commit()

    flight = Flight(
        route_id=route.id,
        flight_number="FR5678",
        price=Decimal("35.00"),
        currency="EUR",
        departure_time=datetime(2026, 6, 20, 8, 0, tzinfo=timezone.utc),
        arrival_time=datetime(2026, 6, 20, 10, 30, tzinfo=timezone.utc),
    )
    db.add(flight)
    db.commit()

    alert = Alert(route_id=route.id, flight_id=flight.id)
    db.add(alert)
    db.commit()
    db.refresh(alert)

    assert alert.id is not None
    assert alert.route_id == route.id
    assert alert.flight_id == flight.id
    assert alert.notified is False
    assert alert.triggered_at is not None


def test_route_flight_relationship(db):
    route = Route(
        origin="AMS",
        destination="BCN",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
    )
    db.add(route)
    db.commit()

    for i, price in enumerate([45.00, 39.99, 55.00]):
        db.add(Flight(
            route_id=route.id,
            flight_number=f"FR100{i}",
            price=Decimal(str(price)),
            currency="EUR",
            departure_time=datetime(2026, 6, 10 + i, 10, 0, tzinfo=timezone.utc),
            arrival_time=datetime(2026, 6, 10 + i, 12, 30, tzinfo=timezone.utc),
        ))
    db.commit()
    db.refresh(route)

    assert len(route.flights) == 3


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


def test_alert_notified_flag(db):
    route = Route(
        origin="AMS",
        destination="BCN",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
        alert_price=Decimal("50.00"),
    )
    db.add(route)
    db.commit()

    flight = Flight(
        route_id=route.id,
        flight_number="FR9999",
        price=Decimal("40.00"),
        currency="EUR",
        departure_time=datetime(2026, 6, 25, 14, 0, tzinfo=timezone.utc),
        arrival_time=datetime(2026, 6, 25, 16, 30, tzinfo=timezone.utc),
    )
    db.add(flight)
    db.commit()

    alert = Alert(route_id=route.id, flight_id=flight.id)
    db.add(alert)
    db.commit()

    alert.notified = True
    db.commit()
    db.refresh(alert)

    assert alert.notified is True
