"""
Tests for GET /flights/search.

All external HTTP calls (Ryanair timetable + oneWayFares) are intercepted by
mocking `requests.get` so the tests run fully offline.
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from routers.flights import _time_window

import pytest


# ---------------------------------------------------------------------------
# Helpers to build fake Ryanair API responses
# ---------------------------------------------------------------------------

def _timetable_response(day: int, dep_times: list[str]):
    """Minimal timetable API JSON for a given day with the given departure times."""
    mock = MagicMock()
    mock.ok = True
    mock.json.return_value = {
        "days": [
            {
                "day": day,
                "flights": [{"departureTime": t} for t in dep_times],
            }
        ]
    }
    return mock


def _fares_response(price: float, currency: str = "EUR",
                    origin: str = "DUB", dest: str = "BCN",
                    flight_number: str = "FR1234",
                    departure_date: str = "2025-06-01T10:00:00"):
    """Minimal oneWayFares API JSON."""
    mock = MagicMock()
    mock.ok = True
    mock.json.return_value = {
        "fares": [
            {
                "outbound": {
                    "flightNumber": flight_number,
                    "price": {"value": price, "currencyCode": currency},
                    "departureAirport": {"iataCode": origin, "name": "Dublin", "countryName": "Ireland"},
                    "arrivalAirport": {"iataCode": dest, "name": "Barcelona", "countryName": "Spain"},
                    "departureDate": departure_date,
                }
            }
        ]
    }
    return mock


def _empty_fares_response():
    mock = MagicMock()
    mock.ok = True
    mock.json.return_value = {"fares": []}
    return mock


def _error_response():
    mock = MagicMock()
    mock.ok = False
    return mock


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFlightsSearch:

    def test_date_from_after_date_to_returns_400(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUB",
            "destination": "BCN",
            "date_from": "2025-06-10",
            "date_to": "2025-06-05",
        })
        assert res.status_code == 400
        assert "date_from" in res.json()["detail"].lower()

    def test_date_range_over_90_days_returns_400(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUB",
            "destination": "BCN",
            "date_from": "2025-06-01",
            "date_to": "2025-09-30",  # 121 days
        })
        assert res.status_code == 400
        assert "90" in res.json()["detail"]

    def test_date_range_exactly_90_days_is_allowed(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                return MagicMock(ok=True, **{"json.return_value": {"days": []}})
            return _empty_fares_response()

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-08-30",  # exactly 90 days
            })
        assert res.status_code == 200

    def test_invalid_iata_code_returns_422(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUBL",
            "destination": "BCN",
            "date_from": "2025-06-01",
            "date_to": "2025-06-08",
        })
        assert res.status_code == 422
        assert "iata" in res.json()["detail"].lower()

    def test_numeric_iata_code_returns_422(self, client):
        res = client.get("/flights/search", params={
            "origin": "123",
            "destination": "BCN",
            "date_from": "2025-06-01",
            "date_to": "2025-06-08",
        })
        assert res.status_code == 422

    def test_successful_search_structure(self, client):
        """A successful search returns outbound, inbound, suggestions, currency."""

        def fake_get(url, **kwargs):
            params = kwargs.get("params", {})

            # Timetable calls (no 'currency' param)
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                if "BCN/DUB" in url:
                    return _timetable_response(8, ["15:00"])
                # Shouldn't be reached, but return empty to be safe
                return _error_response()

            # oneWayFares calls
            origin = params.get("departureAirportIataCode", "")
            dest = params.get("arrivalAirportIataCode", "")
            return _fares_response(
                price=99.99,
                origin=origin or "DUB",
                dest=dest or "BCN",
            )

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        assert res.status_code == 200
        body = res.json()
        assert "outbound" in body
        assert "inbound" in body
        assert "suggestions" in body
        assert "currency" in body

    def test_outbound_flights_returned(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00", "14:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(79.99)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["outbound"]["error"] is None
        assert len(body["outbound"]["flights"]) > 0
        flight = body["outbound"]["flights"][0]
        assert "price" in flight
        assert "flight_number" in flight
        assert "departure_time" in flight

    def test_flights_sorted_cheapest_first(self, client):
        call_count = [0]

        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["08:00", "18:00"])
                return _timetable_response(8, ["16:00"])

            call_count[0] += 1
            # Alternately return expensive then cheap so we can verify sorting
            price = 150.0 if call_count[0] % 2 == 1 else 50.0
            return _fares_response(price)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        flights = res.json()["outbound"]["flights"]
        if len(flights) > 1:
            prices = [f["price"] for f in flights]
            assert prices == sorted(prices)

    def test_seven_suggestions_returned(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        suggestions = res.json()["suggestions"]
        assert len(suggestions) == 7
        offsets = [s["offset"] for s in suggestions]
        assert offsets == list(range(-3, 4))

    def test_selected_suggestion_marked(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        suggestions = res.json()["suggestions"]
        selected = [s for s in suggestions if s["is_selected"]]
        not_selected = [s for s in suggestions if not s["is_selected"]]
        assert len(selected) == 1
        assert selected[0]["offset"] == 0
        assert selected[0]["outbound_date"] == "2025-06-01"
        assert selected[0]["inbound_date"] == "2025-06-08"
        assert all(not s["is_selected"] for s in not_selected)

    def test_suggestion_dates_offset_correctly(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        base_out = date(2025, 6, 1)
        base_in = date(2025, 6, 8)
        for s in res.json()["suggestions"]:
            out = date.fromisoformat(s["outbound_date"])
            inn = date.fromisoformat(s["inbound_date"])
            assert out == base_out + timedelta(days=s["offset"])
            assert inn == base_in + timedelta(days=s["offset"])
            # Trip duration stays constant
            assert (inn - out).days == 7

    def test_no_flights_on_date_returns_empty_list(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                # Timetable has no matching day → empty list
                mock = MagicMock()
                mock.ok = True
                mock.json.return_value = {"days": [{"day": 99, "flights": []}]}
                return mock
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["outbound"]["flights"] == []
        assert body["outbound"]["error"] is None

    def test_timetable_api_failure_returns_empty(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                return _error_response()
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        assert res.status_code == 200
        assert res.json()["outbound"]["flights"] == []

    def test_fares_api_failure_sets_error(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            # Fares API fails for all calls
            return _error_response()

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["outbound"]["flights"] == []
        assert body["outbound"]["error"] is not None

    def test_iata_codes_uppercased(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get) as mock_get:
            client.get("/flights/search", params={
                "origin": "dub",
                "destination": "bcn",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })
            # Verify the timetable URL contains uppercased codes
            timetable_calls = [c for c in mock_get.call_args_list if "timtbl" in c.args[0]]
            assert any("DUB" in c.args[0] for c in timetable_calls)

    def test_currency_from_outbound_flights(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            return _fares_response(99.0, currency="GBP")

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        assert res.json()["currency"] == "GBP"

    def test_inbound_flights_returned(self, client):
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["15:00"])
            params = kwargs.get("params", {})
            origin = params.get("departureAirportIataCode", "DUB")
            dest = params.get("arrivalAirportIataCode", "BCN")
            return _fares_response(79.99, origin=origin, dest=dest)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["inbound"]["error"] is None
        assert len(body["inbound"]["flights"]) > 0
        flight = body["inbound"]["flights"][0]
        assert "price" in flight
        assert "flight_number" in flight
        assert "departure_time" in flight

    def test_timetable_exception_handled(self, client):
        """If requests.get raises, _get_timetable returns [] and flights are empty."""
        with patch("routers.flights.requests.get", side_effect=Exception("network error")):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        assert res.status_code == 200
        body = res.json()
        assert body["outbound"]["flights"] == []
        assert body["inbound"]["flights"] == []

    def test_fares_api_exception_handled(self, client):
        """If the fares API raises for a specific-flight call, that flight is skipped."""
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            params = kwargs.get("params", {})
            if "outboundDepartureTimeFrom" in params:
                raise ConnectionError("fares API down")
            return _fares_response(99.0)

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert res.status_code == 200
        assert body["outbound"]["flights"] == []
        assert body["outbound"]["error"] is not None

    def test_suggestion_cheapest_returns_none_on_empty_fares(self, client):
        """_cheapest_for_date returns None when the fares list is empty."""
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            params = kwargs.get("params", {})
            # Specific-flight calls (with time window) return a price;
            # cheapest-date calls (no time window) return empty fares.
            if "outboundDepartureTimeFrom" in params:
                return _fares_response(99.0)
            return _empty_fares_response()

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        non_selected = [s for s in body["suggestions"] if not s["is_selected"]]
        for s in non_selected:
            assert s["outbound_cheapest"] is None
            assert s["inbound_cheapest"] is None
            assert s["total"] is None

    def test_suggestion_cheapest_returns_none_on_exception(self, client):
        """_cheapest_for_date returns None when the fares API raises."""
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    return _timetable_response(1, ["10:00"])
                return _timetable_response(8, ["16:00"])
            params = kwargs.get("params", {})
            if "outboundDepartureTimeFrom" in params:
                return _fares_response(99.0)
            raise ConnectionError("cheapest API down")

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert res.status_code == 200
        non_selected = [s for s in body["suggestions"] if not s["is_selected"]]
        for s in non_selected:
            assert s["outbound_cheapest"] is None

    def test_currency_from_inbound_when_outbound_empty(self, client):
        """Currency is taken from inbound flights when outbound is empty."""
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                if "DUB/BCN" in url:
                    mock = MagicMock()
                    mock.ok = True
                    mock.json.return_value = {"days": []}
                    return mock
                return _timetable_response(8, ["16:00"])
            return _fares_response(79.99, currency="GBP")

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["outbound"]["flights"] == []
        assert len(body["inbound"]["flights"]) > 0
        assert body["currency"] == "GBP"

    def test_currency_defaults_to_eur_when_no_flights(self, client):
        """Currency defaults to EUR when neither outbound nor inbound has flights."""
        def fake_get(url, **kwargs):
            if "timtbl" in url:
                mock = MagicMock()
                mock.ok = True
                mock.json.return_value = {"days": []}
                return mock
            return _empty_fares_response()

        with patch("routers.flights.requests.get", side_effect=fake_get):
            res = client.get("/flights/search", params={
                "origin": "DUB",
                "destination": "BCN",
                "date_from": "2025-06-01",
                "date_to": "2025-06-08",
            })

        assert res.status_code == 200
        assert res.json()["currency"] == "EUR"


# ---------------------------------------------------------------------------
# Unit tests for _time_window helper
# ---------------------------------------------------------------------------

class TestTimeWindow:

    def test_midday(self):
        start, end = _time_window("10:00")
        assert start == "09:30"
        assert end == "10:30"

    def test_midnight_start_clamped_to_zero(self):
        """00:00 − 30 min would be negative; start must clamp to 00:00."""
        start, end = _time_window("00:00")
        assert start == "00:00"
        assert end == "00:30"

    def test_late_night_end_clamped(self):
        """23:50 + 30 min exceeds 23:59; end must clamp to 23:59."""
        start, end = _time_window("23:50")
        assert start == "23:20"
        assert end == "23:59"
