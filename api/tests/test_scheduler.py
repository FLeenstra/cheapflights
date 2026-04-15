"""
Tests for the hourly route-check scheduler.
"""
import itertools
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from models import Route, RouteCheckLog, User

_counter = itertools.count()


class _BorrowedSession:
    """Wraps the test db session but ignores close() so the fixture stays alive."""
    def __init__(self, session):
        self._s = session
    def __getattr__(self, name):
        return getattr(self._s, name)
    def close(self):
        pass

# Dates that are always in the future relative to the test environment
_FUTURE_FROM = (date.today() + timedelta(days=30)).isoformat()
_FUTURE_TO   = (date.today() + timedelta(days=37)).isoformat()
_PAST_FROM   = "2025-01-01"
_PAST_TO     = "2025-01-08"


def _make_route(db, *, alert_price=None, notify_available=False,
                date_from=None, date_to=None, is_active=True):
    user = User(email=f"u{next(_counter)}@test.com", password_hash="x")
    db.add(user)
    db.flush()
    route = Route(
        user_id=user.id,
        origin="DUB",
        destination="BCN",
        date_from=date.fromisoformat(date_from or _FUTURE_FROM),
        date_to=date.fromisoformat(date_to or _FUTURE_TO),
        alert_price=Decimal(str(alert_price)) if alert_price is not None else None,
        notify_available=notify_available,
        is_active=is_active,
    )
    db.add(route)
    db.commit()
    return route


# ---------------------------------------------------------------------------
# check_routes — route selection
# ---------------------------------------------------------------------------

def test_skips_routes_with_no_alert(db):
    _make_route(db)  # no alert_price, notify_available=False
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    mock_check.assert_not_called()


def test_skips_past_routes(db):
    _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    mock_check.assert_not_called()


def test_skips_inactive_routes(db):
    _make_route(db, alert_price=50, is_active=False)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    mock_check.assert_not_called()


def test_checks_route_with_alert_price(db):
    _make_route(db, alert_price=100)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    assert mock_check.call_count == 1


def test_checks_route_with_notify_available(db):
    _make_route(db, notify_available=True)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    assert mock_check.call_count == 1


def test_checks_multiple_routes(db):
    _make_route(db, alert_price=80)
    _make_route(db, notify_available=True)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()
    assert mock_check.call_count == 2


# ---------------------------------------------------------------------------
# _check_route — log writing
# ---------------------------------------------------------------------------

def test_log_written_when_no_flights(db):
    route = _make_route(db, alert_price=50, notify_available=True)
    with patch("scheduler._cheapest_for_date", return_value=None):
        from scheduler import _check_route
        _check_route(db, route)

    log = db.query(RouteCheckLog).first()
    assert log is not None
    assert log.route_id == route.id
    assert log.outbound_price is None
    assert log.inbound_price is None
    assert log.total_price is None
    assert log.flights_found is False
    assert log.price_goal_reached is False
    assert log.available_goal_reached is False
    assert log.error is None


def test_log_written_with_prices(db):
    route = _make_route(db, alert_price=200)
    with patch("scheduler._cheapest_for_date", side_effect=[29.99, 34.99]):
        from scheduler import _check_route
        _check_route(db, route)

    log = db.query(RouteCheckLog).first()
    assert log.outbound_price == Decimal("29.99")
    assert log.inbound_price == Decimal("34.99")
    assert log.total_price == Decimal("64.98")
    assert log.flights_found is True


# ---------------------------------------------------------------------------
# _check_route — price goal
# ---------------------------------------------------------------------------

def test_price_goal_reached(db):
    route = _make_route(db, alert_price=70)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]):  # total=65 <= 70
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().price_goal_reached is True


def test_price_goal_not_reached(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=[40.0, 40.0]):  # total=80 > 50
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().price_goal_reached is False


def test_price_goal_exact_boundary(db):
    route = _make_route(db, alert_price=70)
    with patch("scheduler._cheapest_for_date", side_effect=[35.0, 35.0]):  # total=70 == 70
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().price_goal_reached is True


def test_price_goal_not_triggered_when_only_one_direction_has_price(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, None]):
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().price_goal_reached is False


# ---------------------------------------------------------------------------
# _check_route — availability goal
# ---------------------------------------------------------------------------

def test_available_goal_reached(db):
    route = _make_route(db, notify_available=True)
    with patch("scheduler._cheapest_for_date", side_effect=[29.99, None]):
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().available_goal_reached is True


def test_available_goal_not_reached_when_no_flights(db):
    route = _make_route(db, notify_available=True)
    with patch("scheduler._cheapest_for_date", return_value=None):
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().available_goal_reached is False


def test_available_goal_not_set_when_flag_false(db):
    route = _make_route(db, notify_available=False, alert_price=200)
    with patch("scheduler._cheapest_for_date", side_effect=[29.99, 34.99]):
        from scheduler import _check_route
        _check_route(db, route)

    assert db.query(RouteCheckLog).first().available_goal_reached is False


# ---------------------------------------------------------------------------
# _check_route — both goals
# ---------------------------------------------------------------------------

def test_both_goals_reached_simultaneously(db):
    route = _make_route(db, alert_price=70, notify_available=True)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]):
        from scheduler import _check_route
        _check_route(db, route)

    log = db.query(RouteCheckLog).first()
    assert log.price_goal_reached is True
    assert log.available_goal_reached is True


# ---------------------------------------------------------------------------
# _check_route — error handling
# ---------------------------------------------------------------------------

def test_error_logged_on_api_failure(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=Exception("connection timeout")):
        from scheduler import _check_route
        _check_route(db, route)

    log = db.query(RouteCheckLog).first()
    assert log is not None
    assert log.error == "connection timeout"
    assert log.price_goal_reached is False


def test_error_truncated_to_500_chars(db):
    route = _make_route(db, alert_price=50)
    long_error = "x" * 600
    with patch("scheduler._cheapest_for_date", side_effect=Exception(long_error)):
        from scheduler import _check_route
        _check_route(db, route)

    assert len(db.query(RouteCheckLog).first().error) == 500


# ---------------------------------------------------------------------------
# Multiple logs accumulate over multiple runs
# ---------------------------------------------------------------------------

def test_multiple_runs_produce_multiple_logs(db):
    route = _make_route(db, alert_price=100)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 40.0, 30.0, 40.0]):
        from scheduler import _check_route
        _check_route(db, route)
        _check_route(db, route)

    assert db.query(RouteCheckLog).count() == 2


# ---------------------------------------------------------------------------
# Route deactivation on goal reached
# ---------------------------------------------------------------------------

def test_route_deactivated_when_price_goal_reached(db):
    route = _make_route(db, alert_price=70)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]):  # total=65 <= 70
        from scheduler import _check_route
        _check_route(db, route)

    db.refresh(route)
    assert route.is_active is False


def test_route_deactivated_when_available_goal_reached(db):
    route = _make_route(db, notify_available=True)
    with patch("scheduler._cheapest_for_date", side_effect=[29.99, None]):
        from scheduler import _check_route
        _check_route(db, route)

    db.refresh(route)
    assert route.is_active is False


def test_route_stays_active_when_goal_not_reached(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=[40.0, 40.0]):  # total=80 > 50
        from scheduler import _check_route
        _check_route(db, route)

    db.refresh(route)
    assert route.is_active is True


def test_route_stays_active_when_no_flights_found(db):
    route = _make_route(db, notify_available=True)
    with patch("scheduler._cheapest_for_date", return_value=None):
        from scheduler import _check_route
        _check_route(db, route)

    db.refresh(route)
    assert route.is_active is True


def test_deactivated_route_not_checked_next_run(db):
    route = _make_route(db, alert_price=70)
    # First run — goal reached, route deactivated
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]):
        from scheduler import _check_route
        _check_route(db, route)

    db.refresh(route)
    assert route.is_active is False

    # Second run via check_routes — deactivated route must be skipped
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._check_route") as mock_check:
        from scheduler import check_routes
        check_routes()

    mock_check.assert_not_called()
