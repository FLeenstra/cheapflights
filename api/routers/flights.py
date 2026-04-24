import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from fli.models import (
    Airport,
    FlightSearchFilters,
    FlightSegment,
    MaxStops,
    PassengerInfo,
    SeatType,
    SortBy,
    TripType,
)
from fli.search import SearchFlights

router = APIRouter(prefix="/flights", tags=["flights"])

_SUGGESTION_OFFSETS = range(-3, 4)  # -3 to +3 inclusive
_IATA_RE = re.compile(r"^[A-Z]{3}$")
_ALL_AIRPORT_IATAS = sorted(ap.name for ap in Airport)

_STOPS_MAP = {
    "non_stop": MaxStops.NON_STOP,
    "one_stop": MaxStops.ONE_STOP_OR_FEWER,
    "any": MaxStops.ANY,
}


def _get_airport(iata: str) -> Airport | None:
    try:
        return Airport[iata]
    except KeyError:
        return None


def _make_filters(origin_ap: Airport, destination_ap: Airport, d: date, stops: MaxStops = MaxStops.NON_STOP) -> FlightSearchFilters:
    return FlightSearchFilters(
        trip_type=TripType.ONE_WAY,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=[
            FlightSegment(
                departure_airport=[[origin_ap, 0]],
                arrival_airport=[[destination_ap, 0]],
                travel_date=d.isoformat(),
            )
        ],
        seat_type=SeatType.ECONOMY,
        stops=stops,
        sort_by=SortBy.CHEAPEST,
    )


def _search_date(origin: str, destination: str, d: date, stops: MaxStops = MaxStops.NON_STOP) -> tuple[list, str | None]:
    """All flights for a specific date, filtered by stops. Returns results sorted cheapest first."""
    origin_ap = _get_airport(origin)
    destination_ap = _get_airport(destination)
    if origin_ap is None or destination_ap is None:
        return [], "Airport not supported"

    try:
        results = SearchFlights().search(_make_filters(origin_ap, destination_ap, d, stops)) or []
    except Exception:
        return [], "Failed to fetch flight data"

    if not results:
        return [], None

    flights = []
    for result in results:
        if not result.legs:
            continue
        leg = result.legs[0]
        last_leg = result.legs[-1]
        flights.append({
            "flight_number": leg.flight_number,
            "price": float(result.price),
            "currency": result.currency or "EUR",
            "origin": leg.departure_airport.name,
            "origin_full": leg.departure_airport.value,
            "destination": last_leg.arrival_airport.name,
            "destination_full": last_leg.arrival_airport.value,
            "departure_time": leg.departure_datetime.isoformat(),
            "airline": leg.airline.value if hasattr(leg.airline, "value") else str(leg.airline),
            "airline_iata": leg.airline.name if hasattr(leg.airline, "name") else None,
            "stops": len(result.legs) - 1,
        })

    return sorted(flights, key=lambda f: f["price"]), None


def _cheapest_for_date(origin: str, destination: str, d: date, stops: MaxStops = MaxStops.NON_STOP) -> float | None:
    """Returns the cheapest price on a given date (per person) with the given stops setting."""
    origin_ap = _get_airport(origin)
    destination_ap = _get_airport(destination)
    if origin_ap is None or destination_ap is None:
        return None

    try:
        results = SearchFlights().search(_make_filters(origin_ap, destination_ap, d, stops)) or []
        return float(results[0].price) if results else None
    except Exception:
        return None


@router.get("/routes/{origin}")
def get_routes(origin: str):
    origin = origin.strip().upper()
    if not _IATA_RE.match(origin):
        raise HTTPException(status_code=422, detail="origin must be a 3-letter IATA code")
    destinations = [iata for iata in _ALL_AIRPORT_IATAS if iata != origin]
    return {"destinations": destinations}


@router.get("/search")
def search_flights(origin: str, destination: str, date_from: date, date_to: date, max_stops: str = "non_stop"):
    origin = origin.strip().upper()
    destination = destination.strip().upper()

    if not _IATA_RE.match(origin) or not _IATA_RE.match(destination):
        raise HTTPException(status_code=422, detail="origin and destination must be 3-letter IATA codes")

    if max_stops not in _STOPS_MAP:
        raise HTTPException(status_code=422, detail="max_stops must be one of: non_stop, one_stop, any")

    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    if (date_to - date_from).days > 90:
        raise HTTPException(status_code=400, detail="Date range must not exceed 90 days")

    stops = _STOPS_MAP[max_stops]

    with ThreadPoolExecutor(max_workers=20) as ex:
        out_future = ex.submit(_search_date, origin, destination, date_from, stops)
        in_future = ex.submit(_search_date, destination, origin, date_to, stops)

        sugg_futures = {
            offset: (
                ex.submit(_cheapest_for_date, origin, destination, date_from + timedelta(days=offset), stops),
                ex.submit(_cheapest_for_date, destination, origin, date_to + timedelta(days=offset), stops),
            )
            for offset in _SUGGESTION_OFFSETS if offset != 0
        }

        outbound_flights, outbound_error = out_future.result()
        inbound_flights, inbound_error = in_future.result()

        selected_out_price = outbound_flights[0]["price"] if outbound_flights else None
        selected_in_price = inbound_flights[0]["price"] if inbound_flights else None
        currency = (
            outbound_flights[0]["currency"] if outbound_flights
            else inbound_flights[0]["currency"] if inbound_flights
            else "EUR"
        )

        suggestions = []
        for offset in _SUGGESTION_OFFSETS:
            out_date = date_from + timedelta(days=offset)
            in_date = date_to + timedelta(days=offset)

            if offset == 0:
                out_price = selected_out_price
                in_price = selected_in_price
            else:
                out_price = sugg_futures[offset][0].result()
                in_price = sugg_futures[offset][1].result()

            total = (out_price + in_price) if (out_price is not None and in_price is not None) else None
            suggestions.append({
                "offset": offset,
                "outbound_date": out_date.isoformat(),
                "inbound_date": in_date.isoformat(),
                "outbound_cheapest": out_price,
                "inbound_cheapest": in_price,
                "total": total,
                "is_selected": offset == 0,
            })

    return {
        "outbound": {"flights": outbound_flights, "error": outbound_error},
        "inbound": {"flights": inbound_flights, "error": inbound_error},
        "suggestions": suggestions,
        "currency": currency,
    }
