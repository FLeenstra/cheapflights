"""
Tests for the hourly route-check scheduler.
"""
import itertools
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from models import Route, RouteCheckLog, User
from unittest.mock import MagicMock

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


# ---------------------------------------------------------------------------
# Alert email — sent on goal reached, not sent otherwise
# ---------------------------------------------------------------------------

_MOCK_FLIGHT_OUT = {
    "flight_number": "FR1234", "price": 30.0, "currency": "EUR",
    "origin": "DUB", "origin_full": "Dublin, Ireland",
    "destination": "BCN", "destination_full": "Barcelona, Spain",
    "departure_time": "2026-06-01T06:00:00",
}
_MOCK_FLIGHT_IN = {
    "flight_number": "FR5678", "price": 35.0, "currency": "EUR",
    "origin": "BCN", "origin_full": "Barcelona, Spain",
    "destination": "DUB", "destination_full": "Dublin, Ireland",
    "departure_time": "2026-06-08T18:00:00",
}


def test_alert_email_sent_when_price_goal_reached(db):
    route = _make_route(db, alert_price=70)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]), \
         patch("scheduler._search_date", side_effect=[([_MOCK_FLIGHT_OUT], None), ([_MOCK_FLIGHT_IN], None)]), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    mock_email.assert_called_once()
    args = mock_email.call_args[0]
    assert args[0].endswith("@test.com")  # to_email is the user's email
    assert args[2] is True   # price_goal
    assert args[3] is False  # avail_goal


def test_alert_email_sent_when_availability_goal_reached(db):
    route = _make_route(db, notify_available=True)
    with patch("scheduler._cheapest_for_date", side_effect=[29.99, None]), \
         patch("scheduler._search_date", side_effect=[([_MOCK_FLIGHT_OUT], None), ([], None)]), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    mock_email.assert_called_once()
    args = mock_email.call_args[0]
    assert args[2] is False  # price_goal
    assert args[3] is True   # avail_goal


def test_alert_email_sent_when_both_goals_reached(db):
    route = _make_route(db, alert_price=70, notify_available=True)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]), \
         patch("scheduler._search_date", side_effect=[([_MOCK_FLIGHT_OUT], None), ([_MOCK_FLIGHT_IN], None)]), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    mock_email.assert_called_once()
    args = mock_email.call_args[0]
    assert args[2] is True  # price_goal
    assert args[3] is True  # avail_goal


def test_alert_email_not_sent_when_goal_not_reached(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=[40.0, 40.0]), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    mock_email.assert_not_called()


def test_alert_email_not_sent_on_api_error(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=Exception("timeout")), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    mock_email.assert_not_called()


def test_alert_email_receives_flight_lists_on_goal_reached(db):
    route = _make_route(db, alert_price=70)
    with patch("scheduler._cheapest_for_date", side_effect=[30.0, 35.0]), \
         patch("scheduler._search_date", side_effect=[([_MOCK_FLIGHT_OUT], None), ([_MOCK_FLIGHT_IN], None)]), \
         patch("scheduler._send_alert_email") as mock_email:
        from scheduler import _check_route
        _check_route(db, route)

    _, kwargs = mock_email.call_args
    assert kwargs["outbound_flights"] == [_MOCK_FLIGHT_OUT]
    assert kwargs["inbound_flights"] == [_MOCK_FLIGHT_IN]


def test_search_date_not_called_when_goal_not_reached(db):
    route = _make_route(db, alert_price=50)
    with patch("scheduler._cheapest_for_date", side_effect=[40.0, 40.0]), \
         patch("scheduler._search_date") as mock_search:
        from scheduler import _check_route
        _check_route(db, route)

    mock_search.assert_not_called()


# ---------------------------------------------------------------------------
# _send_alert_email — unit tests
# ---------------------------------------------------------------------------

def test_send_alert_email_no_smtp_host_returns_early():
    import os
    from scheduler import _send_alert_email

    mock_route = MagicMock()
    mock_route.origin = "DUB"
    mock_route.destination = "BCN"
    mock_route.date_from = "2026-06-01"
    mock_route.date_to = "2026-06-08"
    mock_route.alert_price = None

    os.environ.pop("SMTP_HOST", None)
    with patch("scheduler.smtplib.SMTP") as mock_smtp:
        _send_alert_email("user@test.com", mock_route, True, False, 65.0)
    mock_smtp.assert_not_called()


def test_send_alert_email_smtp_called():
    from scheduler import _send_alert_email

    mock_route = MagicMock()
    mock_route.origin = "DUB"
    mock_route.destination = "BCN"
    mock_route.date_from = "2026-06-01"
    mock_route.date_to = "2026-06-08"
    mock_route.alert_price = 70

    env = {"SMTP_HOST": "mailpit", "SMTP_PORT": "1025", "SMTP_USER": "",
           "SMTP_PASSWORD": "", "SMTP_FROM": "noreply@elcheeapo.com"}
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)

    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", return_value=mock_smtp):
            _send_alert_email("user@test.com", mock_route, True, False, 65.0)

    mock_smtp.starttls.assert_not_called()   # no SMTP_USER → no TLS
    mock_smtp.send_message.assert_called_once()


def test_send_alert_email_smtp_failure_does_not_raise():
    from scheduler import _send_alert_email

    mock_route = MagicMock()
    mock_route.origin = "DUB"
    mock_route.destination = "BCN"
    mock_route.date_from = "2026-06-01"
    mock_route.date_to = "2026-06-08"
    mock_route.alert_price = None

    env = {"SMTP_HOST": "smtp.broken.com", "SMTP_PORT": "587", "SMTP_USER": "", "SMTP_PASSWORD": ""}
    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", side_effect=ConnectionRefusedError("refused")):
            _send_alert_email("user@test.com", mock_route, False, True, None)
    # Must not raise


def _get_alert_email_html(outbound_flights=None, inbound_flights=None):
    """Helper: send a mock alert email and return the HTML body."""
    from scheduler import _send_alert_email
    mock_route = MagicMock()
    mock_route.origin = "DUB"
    mock_route.destination = "BCN"
    mock_route.date_from = "2026-06-01"
    mock_route.date_to = "2026-06-08"
    mock_route.alert_price = 70

    sent_messages = []
    env = {"SMTP_HOST": "mailpit", "SMTP_PORT": "1025", "SMTP_USER": "", "SMTP_FROM": "x@x.com"}
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    mock_smtp.send_message.side_effect = lambda m: sent_messages.append(m)

    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", return_value=mock_smtp):
            _send_alert_email(
                "user@test.com", mock_route, True, False, 65.0,
                adults_count=1,
                outbound_flights=outbound_flights,
                inbound_flights=inbound_flights,
            )
    return sent_messages[0].get_body(preferencelist=("html",)).get_content()


def test_send_alert_email_includes_flight_table_in_html():
    html = _get_alert_email_html([_MOCK_FLIGHT_OUT], [_MOCK_FLIGHT_IN])
    assert "FR1234" in html
    assert "FR5678" in html
    assert "Best price" in html
    assert "65.00" in html  # cheapest total


def test_send_alert_email_includes_single_booking_links():
    html = _get_alert_email_html([_MOCK_FLIGHT_OUT], [_MOCK_FLIGHT_IN])
    assert "Single" in html
    assert "isReturn=false" in html
    assert "originIata=DUB" in html


def test_send_alert_email_includes_return_booking_links():
    html = _get_alert_email_html([_MOCK_FLIGHT_OUT], [_MOCK_FLIGHT_IN])
    assert "Return" in html
    assert "isReturn=true" in html
    assert "dateOut=2026-06-01" in html
    assert "dateIn=2026-06-08" in html


# ---------------------------------------------------------------------------
# _pax_label — unit tests
# ---------------------------------------------------------------------------

def test_pax_label_adults_only():
    from scheduler import _pax_label
    assert _pax_label(1, []) == "1 adult"
    assert _pax_label(2, []) == "2 adults"


def test_pax_label_one_child():
    from scheduler import _pax_label
    assert _pax_label(2, [7]) == "2 adults, 1 child (age 7)"


def test_pax_label_one_infant():
    from scheduler import _pax_label
    assert _pax_label(1, [1]) == "1 adult, 1 infant (age 1)"


def test_pax_label_multiple_children():
    from scheduler import _pax_label
    assert _pax_label(2, [3, 7]) == "2 adults, 2 children (ages 3, 7)"


# ---------------------------------------------------------------------------
# _pax_breakdown — URL params
# ---------------------------------------------------------------------------

def test_pax_breakdown_adults_only():
    from scheduler import _pax_breakdown
    result = _pax_breakdown(2, [])
    assert result == {"adults": "2", "teens": "0", "children": "0", "infants": "0"}


def test_pax_breakdown_with_infant_and_child():
    from scheduler import _pax_breakdown
    result = _pax_breakdown(2, [1, 7])
    assert result["infants"] == "1"
    assert result["children"] == "1"
    assert result["teens"] == "0"


def test_pax_breakdown_with_teen():
    from scheduler import _pax_breakdown
    result = _pax_breakdown(1, [13])
    assert result["teens"] == "1"
    assert result["children"] == "0"
    assert result["infants"] == "0"


# ---------------------------------------------------------------------------
# _send_alert_email — passenger breakdown in email body
# ---------------------------------------------------------------------------

def _get_alert_email_html_with_children(adults_count, children_ages):
    from scheduler import _send_alert_email
    mock_route = MagicMock()
    mock_route.origin = "DUB"
    mock_route.destination = "BCN"
    mock_route.date_from = "2026-06-01"
    mock_route.date_to = "2026-06-08"
    mock_route.alert_price = 200

    sent_messages = []
    env = {"SMTP_HOST": "mailpit", "SMTP_PORT": "1025", "SMTP_USER": "", "SMTP_FROM": "x@x.com"}
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    mock_smtp.send_message.side_effect = lambda m: sent_messages.append(m)

    total = 120.0 * (adults_count + len(children_ages))
    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", return_value=mock_smtp):
            _send_alert_email(
                "user@test.com", mock_route, True, False, total,
                adults_count=adults_count,
                children_ages=children_ages,
            )
    return sent_messages[0].get_body(preferencelist=("html",)).get_content()


def test_send_alert_email_shows_adult_and_child_label():
    html = _get_alert_email_html_with_children(2, [7])
    assert "2 adults" in html
    assert "1 child" in html
    assert "age 7" in html


def test_send_alert_email_shows_infant_label():
    html = _get_alert_email_html_with_children(1, [1])
    assert "1 infant" in html


def test_send_alert_email_booking_url_includes_children():
    html = _get_alert_email_html_with_children(2, [7, 3])
    # 2 children ages 3 and 7 → children=2 in URL
    assert "children=2" in html


def test_send_alert_email_booking_url_includes_infants():
    html = _get_alert_email_html_with_children(1, [0])
    assert "infants=1" in html


# ---------------------------------------------------------------------------
# expire_routes — route selection
# ---------------------------------------------------------------------------

def test_expire_routes_skips_future_routes(db):
    _make_route(db, alert_price=50)  # date_from is in the future
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route") as mock_expire:
        from scheduler import expire_routes
        expire_routes()
    mock_expire.assert_not_called()


def test_expire_routes_skips_routes_without_alert(db):
    _make_route(db, date_from=_PAST_FROM, date_to=_PAST_TO)  # no alert
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route") as mock_expire:
        from scheduler import expire_routes
        expire_routes()
    mock_expire.assert_not_called()


def test_expire_routes_skips_inactive_routes(db):
    # is_active=False means the goal was already reached — don't resend a failure email
    _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO, is_active=False)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route") as mock_expire:
        from scheduler import expire_routes
        expire_routes()
    mock_expire.assert_not_called()


def test_expire_routes_expires_past_route_with_alert_price(db):
    _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route") as mock_expire:
        from scheduler import expire_routes
        expire_routes()
    assert mock_expire.call_count == 1


def test_expire_routes_expires_past_route_with_notify_available(db):
    _make_route(db, notify_available=True, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route") as mock_expire:
        from scheduler import expire_routes
        expire_routes()
    assert mock_expire.call_count == 1


def test_expire_routes_returns_count(db):
    _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    _make_route(db, notify_available=True, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler._expire_route"):
        from scheduler import expire_routes
        count = expire_routes()
    assert count == 2


# ---------------------------------------------------------------------------
# _expire_route — deletion and email
# ---------------------------------------------------------------------------

def test_expire_route_deletes_route(db):
    route = _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    route_id = route.id
    with patch("scheduler._send_expired_email"):
        from scheduler import _expire_route
        _expire_route(db, route)
    assert db.query(Route).filter(Route.id == route_id).first() is None


def test_expire_route_deletes_check_logs(db):
    route = _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    db.add(RouteCheckLog(route_id=route.id, flights_found=False))
    db.add(RouteCheckLog(route_id=route.id, flights_found=False))
    db.commit()
    assert db.query(RouteCheckLog).count() == 2

    with patch("scheduler._send_expired_email"):
        from scheduler import _expire_route
        _expire_route(db, route)
    assert db.query(RouteCheckLog).count() == 0


def test_expire_route_sends_expired_email(db):
    route = _make_route(db, alert_price=50, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler._send_expired_email") as mock_email:
        from scheduler import _expire_route
        _expire_route(db, route)
    mock_email.assert_called_once()
    args = mock_email.call_args[0]
    assert args[0].endswith("@test.com")  # to_email
    assert args[1] == "DUB"              # origin
    assert args[2] == "BCN"              # destination


def test_expire_route_email_includes_alert_price(db):
    route = _make_route(db, alert_price=75, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler._send_expired_email") as mock_email:
        from scheduler import _expire_route
        _expire_route(db, route)
    args = mock_email.call_args[0]
    assert float(args[5]) == 75.0  # alert_price


def test_expire_route_email_includes_notify_available(db):
    route = _make_route(db, notify_available=True, date_from=_PAST_FROM, date_to=_PAST_TO)
    with patch("scheduler._send_expired_email") as mock_email:
        from scheduler import _expire_route
        _expire_route(db, route)
    args = mock_email.call_args[0]
    assert args[6] is True  # notify_available


# ---------------------------------------------------------------------------
# check_routes calls expire_routes
# ---------------------------------------------------------------------------

def test_check_routes_calls_expire_routes(db):
    with patch("scheduler.SessionLocal", return_value=_BorrowedSession(db)), \
         patch("scheduler.expire_routes") as mock_expire:
        from scheduler import check_routes
        check_routes()
    mock_expire.assert_called_once()


# ---------------------------------------------------------------------------
# _send_expired_email — unit tests
# ---------------------------------------------------------------------------

def test_send_expired_email_no_smtp_host_returns_early():
    import os
    from scheduler import _send_expired_email
    os.environ.pop("SMTP_HOST", None)
    with patch("scheduler.smtplib.SMTP") as mock_smtp:
        _send_expired_email("user@test.com", "DUB", "BCN", "2026-01-01", "2026-01-08", 50, False)
    mock_smtp.assert_not_called()


def test_send_expired_email_smtp_called():
    from scheduler import _send_expired_email
    env = {"SMTP_HOST": "mailpit", "SMTP_PORT": "1025", "SMTP_USER": "",
           "SMTP_PASSWORD": "", "SMTP_FROM": "noreply@elcheeapo.com"}
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", return_value=mock_smtp):
            _send_expired_email("user@test.com", "DUB", "BCN", "2026-01-01", "2026-01-08", 50, True)
    mock_smtp.send_message.assert_called_once()


def test_send_expired_email_smtp_failure_does_not_raise():
    from scheduler import _send_expired_email
    env = {"SMTP_HOST": "smtp.broken.com", "SMTP_PORT": "587", "SMTP_USER": "", "SMTP_PASSWORD": ""}
    with patch.dict("os.environ", env):
        with patch("scheduler.smtplib.SMTP", side_effect=ConnectionRefusedError("refused")):
            _send_expired_email("user@test.com", "DUB", "BCN", "2026-01-01", "2026-01-08", None, True)
    # Must not raise
