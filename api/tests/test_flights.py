"""
Tests for GET /flights/search and GET /flights/routes/{origin}.

SearchFlights (fli library) is mocked so tests run fully offline.
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers to build fake fli FlightResult objects
# ---------------------------------------------------------------------------

def _make_flight_result(
    price: float = 99.99,
    currency: str = "EUR",
    flight_number: str = "FR1234",
    origin_iata: str = "DUB",
    dest_iata: str = "BCN",
    airline_name: str = "Ryanair",
    airline_iata: str = "FR",
    departure_iso: str = "2025-06-01T10:00:00",
):
    leg = MagicMock()
    leg.flight_number = flight_number
    leg.departure_airport.name = origin_iata
    leg.departure_airport.value = f"{origin_iata} Airport"
    leg.arrival_airport.name = dest_iata
    leg.arrival_airport.value = f"{dest_iata} Airport"
    leg.departure_datetime.isoformat.return_value = departure_iso
    leg.airline.value = airline_name
    leg.airline.name = airline_iata

    result = MagicMock()
    result.price = price
    result.currency = currency
    result.legs = [leg]
    return result


def _make_flight_dict(
    price: float = 99.99,
    currency: str = "EUR",
    flight_number: str = "FR1234",
    origin_iata: str = "DUB",
    dest_iata: str = "BCN",
    airline_name: str = "Ryanair",
    airline_iata: str = "FR",
    departure_iso: str = "2027-06-01T10:00:00",
):
    """Return a flight dict as _search_date would produce."""
    return {
        "flight_number": flight_number,
        "price": price,
        "currency": currency,
        "origin": origin_iata,
        "origin_full": f"{origin_iata} Airport",
        "destination": dest_iata,
        "destination_full": f"{dest_iata} Airport",
        "departure_time": departure_iso,
        "airline": airline_name,
        "airline_iata": airline_iata,
    }


def _mock_sf(results):
    """Return a patch value for SearchFlights that yields `results` from .search()."""
    mock_cls = MagicMock()
    mock_cls.return_value.search.return_value = results
    return mock_cls


# ---------------------------------------------------------------------------
# Tests for GET /flights/search
# ---------------------------------------------------------------------------

class TestFlightsSearchValidation:

    def test_date_from_after_date_to_returns_400(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUB", "destination": "BCN",
            "date_from": "2025-06-10", "date_to": "2025-06-05",
        })
        assert res.status_code == 400
        assert "date_from" in res.json()["detail"].lower()

    def test_date_range_over_90_days_returns_400(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUB", "destination": "BCN",
            "date_from": "2025-06-01", "date_to": "2025-09-30",
        })
        assert res.status_code == 400
        assert "90" in res.json()["detail"]

    def test_date_range_exactly_90_days_is_allowed(self, client):
        with patch("routers.flights.SearchFlights", _mock_sf([])):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-08-30",
            })
        assert res.status_code == 200

    def test_invalid_iata_code_returns_422(self, client):
        res = client.get("/flights/search", params={
            "origin": "DUBL", "destination": "BCN",
            "date_from": "2025-06-01", "date_to": "2025-06-08",
        })
        assert res.status_code == 422
        assert "iata" in res.json()["detail"].lower()

    def test_numeric_iata_code_returns_422(self, client):
        res = client.get("/flights/search", params={
            "origin": "123", "destination": "BCN",
            "date_from": "2025-06-01", "date_to": "2025-06-08",
        })
        assert res.status_code == 422

    def test_iata_codes_uppercased(self, client):
        """Lowercase codes are normalised before use."""
        with patch("routers.flights._search_date", return_value=([], None)) as mock_sd, \
             patch("routers.flights._cheapest_for_date", return_value=None):
            client.get("/flights/search", params={
                "origin": "dub", "destination": "bcn",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })
        calls = mock_sd.call_args_list
        assert all(c.args[0].isupper() and c.args[1].isupper() for c in calls)


class TestFlightsSearchResults:

    def _search(self, client, out_flights=None, in_flights=None, cheapest=30.0):
        out = out_flights if out_flights is not None else [_make_flight_dict()]
        inn = in_flights if in_flights is not None else [_make_flight_dict(
            origin_iata="BCN", dest_iata="DUB", flight_number="FR5678",
            departure_iso="2027-06-08T15:00:00",
        )]

        def fake_search(origin, dest, d):
            return (out if origin == "DUB" else inn, None)

        with patch("routers.flights._search_date", side_effect=fake_search), \
             patch("routers.flights._cheapest_for_date", return_value=cheapest):
            return client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })

    def test_response_structure(self, client):
        res = self._search(client)
        assert res.status_code == 200
        body = res.json()
        assert "outbound" in body
        assert "inbound" in body
        assert "suggestions" in body
        assert "currency" in body

    def test_outbound_flights_returned(self, client):
        res = self._search(client)
        body = res.json()
        assert body["outbound"]["error"] is None
        assert len(body["outbound"]["flights"]) > 0
        flight = body["outbound"]["flights"][0]
        assert "price" in flight
        assert "flight_number" in flight
        assert "departure_time" in flight

    def test_inbound_flights_returned(self, client):
        res = self._search(client)
        body = res.json()
        assert body["inbound"]["error"] is None
        assert len(body["inbound"]["flights"]) > 0

    def test_flight_includes_airline_field(self, client):
        res = self._search(client)
        flight = res.json()["outbound"]["flights"][0]
        assert "airline" in flight
        assert flight["airline"] == "Ryanair"
        assert flight["airline_iata"] == "FR"

    def test_seven_suggestions_returned(self, client):
        res = self._search(client)
        suggestions = res.json()["suggestions"]
        assert len(suggestions) == 7
        assert [s["offset"] for s in suggestions] == list(range(-3, 4))

    def test_selected_suggestion_marked(self, client):
        res = self._search(client)
        suggestions = res.json()["suggestions"]
        selected = [s for s in suggestions if s["is_selected"]]
        assert len(selected) == 1
        assert selected[0]["offset"] == 0
        assert selected[0]["outbound_date"] == "2025-06-01"
        assert selected[0]["inbound_date"] == "2025-06-08"

    def test_suggestion_dates_offset_correctly(self, client):
        res = self._search(client)
        base_out = date(2025, 6, 1)
        base_in = date(2025, 6, 8)
        for s in res.json()["suggestions"]:
            out = date.fromisoformat(s["outbound_date"])
            inn = date.fromisoformat(s["inbound_date"])
            assert out == base_out + timedelta(days=s["offset"])
            assert inn == base_in + timedelta(days=s["offset"])
            assert (inn - out).days == 7

    def test_currency_from_outbound_flights(self, client):
        out = [_make_flight_dict(currency="GBP")]
        res = self._search(client, out_flights=out)
        assert res.json()["currency"] == "GBP"

    def test_currency_from_inbound_when_outbound_empty(self, client):
        inn = [_make_flight_dict(currency="GBP", origin_iata="BCN", dest_iata="DUB")]

        def fake_search(origin, dest, d):
            return ([], None) if origin == "DUB" else (inn, None)

        with patch("routers.flights._search_date", side_effect=fake_search), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })

        body = res.json()
        assert body["outbound"]["flights"] == []
        assert len(body["inbound"]["flights"]) > 0
        assert body["currency"] == "GBP"

    def test_currency_defaults_to_eur_when_no_flights(self, client):
        with patch("routers.flights._search_date", return_value=([], None)), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })
        assert res.status_code == 200
        assert res.json()["currency"] == "EUR"

    def test_no_flights_returns_empty_list_no_error(self, client):
        with patch("routers.flights._search_date", return_value=([], None)), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })
        body = res.json()
        assert body["outbound"]["flights"] == []
        assert body["outbound"]["error"] is None

    def test_search_exception_returns_error_message(self, client):
        with patch("routers.flights._search_date", return_value=([], "Failed to fetch flight data")), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })
        body = res.json()
        assert res.status_code == 200
        assert body["outbound"]["error"] is not None

    def test_cheapest_none_when_no_suggestion_flights(self, client):
        def fake_search(origin, dest, d):
            return ([_make_flight_result()], None)

        with patch("routers.flights._search_date", side_effect=fake_search), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })

        non_selected = [s for s in res.json()["suggestions"] if not s["is_selected"]]
        for s in non_selected:
            assert s["outbound_cheapest"] is None
            assert s["total"] is None

    def test_cheapest_none_on_exception(self, client):
        def fake_search(origin, dest, d):
            return ([_make_flight_dict()], None)

        with patch("routers.flights._search_date", side_effect=fake_search), \
             patch("routers.flights._cheapest_for_date", return_value=None):
            res = client.get("/flights/search", params={
                "origin": "DUB", "destination": "BCN",
                "date_from": "2025-06-01", "date_to": "2025-06-08",
            })

        assert res.status_code == 200


# ---------------------------------------------------------------------------
# Unit tests for _search_date
# ---------------------------------------------------------------------------

_MOCK_FILTERS = MagicMock()


class TestSearchDate:
    from datetime import date as _date

    def test_returns_flights_on_success(self):
        from routers.flights import _search_date
        result = _make_flight_result()
        with patch("routers.flights.SearchFlights", _mock_sf([result])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, error = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert error is None
        assert len(flights) == 1
        assert flights[0]["flight_number"] == "FR1234"
        assert flights[0]["price"] == 99.99
        assert flights[0]["currency"] == "EUR"
        assert flights[0]["origin"] == "DUB"
        assert flights[0]["destination"] == "BCN"
        assert flights[0]["airline"] == "Ryanair"
        assert flights[0]["airline_iata"] == "FR"

    def test_returns_empty_list_when_no_results(self):
        from routers.flights import _search_date
        with patch("routers.flights.SearchFlights", _mock_sf([])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, error = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert flights == []
        assert error is None

    def test_returns_error_on_exception(self):
        from routers.flights import _search_date
        mock_cls = MagicMock()
        mock_cls.return_value.search.side_effect = Exception("network error")
        with patch("routers.flights.SearchFlights", mock_cls), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, error = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert flights == []
        assert error == "Failed to fetch flight data"

    def test_returns_error_for_unsupported_airport(self):
        from routers.flights import _search_date
        flights, error = _search_date("XYZ", "BCN", date(2025, 6, 1))
        assert flights == []
        assert error == "Airport not supported"

    def test_skips_result_with_no_legs(self):
        from routers.flights import _search_date
        no_legs = MagicMock()
        no_legs.legs = []
        with_legs = _make_flight_result(price=50.0)
        with patch("routers.flights.SearchFlights", _mock_sf([no_legs, with_legs])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, error = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert len(flights) == 1
        assert flights[0]["price"] == 50.0

    def test_multiple_flights_returned_in_order(self):
        from routers.flights import _search_date
        r1 = _make_flight_result(price=30.0, flight_number="FR001")
        r2 = _make_flight_result(price=50.0, flight_number="FR002")
        with patch("routers.flights.SearchFlights", _mock_sf([r1, r2])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, _ = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert flights[0]["flight_number"] == "FR001"
        assert flights[1]["flight_number"] == "FR002"

    def test_currency_fallback_to_eur_when_none(self):
        from routers.flights import _search_date
        result = _make_flight_result()
        result.currency = None
        with patch("routers.flights.SearchFlights", _mock_sf([result])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            flights, _ = _search_date("DUB", "BCN", date(2025, 6, 1))
        assert flights[0]["currency"] == "EUR"


# ---------------------------------------------------------------------------
# Unit tests for _cheapest_for_date
# ---------------------------------------------------------------------------

class TestCheapestForDate:

    def test_returns_cheapest_price(self):
        from routers.flights import _cheapest_for_date
        result = _make_flight_result(price=42.5)
        with patch("routers.flights.SearchFlights", _mock_sf([result])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            price = _cheapest_for_date("DUB", "BCN", date(2025, 6, 1))
        assert price == 42.5

    def test_returns_none_when_no_results(self):
        from routers.flights import _cheapest_for_date
        with patch("routers.flights.SearchFlights", _mock_sf([])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            price = _cheapest_for_date("DUB", "BCN", date(2025, 6, 1))
        assert price is None

    def test_returns_none_on_exception(self):
        from routers.flights import _cheapest_for_date
        mock_cls = MagicMock()
        mock_cls.return_value.search.side_effect = Exception("timeout")
        with patch("routers.flights.SearchFlights", mock_cls), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            price = _cheapest_for_date("DUB", "BCN", date(2025, 6, 1))
        assert price is None

    def test_returns_none_for_unsupported_airport(self):
        from routers.flights import _cheapest_for_date
        price = _cheapest_for_date("XYZ", "BCN", date(2025, 6, 1))
        assert price is None

    def test_returns_float(self):
        from routers.flights import _cheapest_for_date
        result = _make_flight_result(price=29.99)
        with patch("routers.flights.SearchFlights", _mock_sf([result])), \
             patch("routers.flights._make_filters", return_value=_MOCK_FILTERS):
            price = _cheapest_for_date("DUB", "BCN", date(2025, 6, 1))
        assert isinstance(price, float)


# ---------------------------------------------------------------------------
# Tests for GET /flights/routes/{origin}
# ---------------------------------------------------------------------------

class TestGetRoutes:

    def test_valid_origin_returns_destinations(self, client):
        res = client.get("/flights/routes/DUB")
        assert res.status_code == 200
        destinations = res.json()["destinations"]
        assert isinstance(destinations, list)
        assert len(destinations) > 0

    def test_origin_excluded_from_destinations(self, client):
        res = client.get("/flights/routes/DUB")
        assert "DUB" not in res.json()["destinations"]

    def test_known_airports_included(self, client):
        res = client.get("/flights/routes/DUB")
        destinations = set(res.json()["destinations"])
        assert "BCN" in destinations
        assert "AMS" in destinations

    def test_invalid_iata_returns_422(self, client):
        res = client.get("/flights/routes/INVALID")
        assert res.status_code == 422

    def test_lowercase_origin_normalised(self, client):
        res = client.get("/flights/routes/dub")
        assert res.status_code == 200
        assert "DUB" not in res.json()["destinations"]
