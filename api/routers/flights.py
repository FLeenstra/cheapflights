import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import requests
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/flights", tags=["flights"])

_BASE = "https://services-api.ryanair.com"
_TIMETABLE_URL = _BASE + "/timtbl/3/schedules/{origin}/{destination}/years/{year}/months/{month}"
_FARES_URL = _BASE + "/farfnd/v4/oneWayFares"
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ElCheapo/1.0)"}
_SUGGESTION_OFFSETS = range(-3, 4)  # -3 to +3 inclusive


def _time_window(dep_time: str) -> tuple[str, str]:
    h, m = map(int, dep_time.split(":"))
    start = max(0, h * 60 + m - 30)
    end = min(23 * 60 + 59, h * 60 + m + 30)
    return f"{start // 60:02d}:{start % 60:02d}", f"{end // 60:02d}:{end % 60:02d}"


def _get_timetable(origin: str, destination: str, year: int, month: int) -> list[dict]:
    url = _TIMETABLE_URL.format(origin=origin, destination=destination, year=year, month=month)
    try:
        r = requests.get(url, headers=_HEADERS, timeout=10)
        return r.json().get("days", []) if r.ok else []
    except Exception:
        return []


def _get_flight_price(origin: str, destination: str, d: date, dep_time: str) -> dict | None:
    time_from, time_to = _time_window(dep_time)
    try:
        r = requests.get(
            _FARES_URL,
            params={
                "departureAirportIataCode": origin,
                "arrivalAirportIataCode": destination,
                "outboundDepartureDateFrom": d.isoformat(),
                "outboundDepartureDateTo": d.isoformat(),
                "outboundDepartureTimeFrom": time_from,
                "outboundDepartureTimeTo": time_to,
                "currency": "EUR",
            },
            headers=_HEADERS,
            timeout=10,
        )
        if not r.ok:
            return None
        fares = r.json().get("fares", [])
        if not fares:
            return None
        f = fares[0]["outbound"]
        return {
            "flight_number": f["flightNumber"],
            "price": f["price"]["value"],
            "currency": f["price"]["currencyCode"],
            "origin": f["departureAirport"]["iataCode"],
            "origin_full": f["departureAirport"]["name"] + ", " + f["departureAirport"]["countryName"],
            "destination": f["arrivalAirport"]["iataCode"],
            "destination_full": f["arrivalAirport"]["name"] + ", " + f["arrivalAirport"]["countryName"],
            "departure_time": f["departureDate"],
        }
    except Exception:
        return None


def _cheapest_for_date(origin: str, destination: str, d: date) -> float | None:
    """Single oneWayFares call — returns the cheapest price on a given date."""
    try:
        r = requests.get(
            _FARES_URL,
            params={
                "departureAirportIataCode": origin,
                "arrivalAirportIataCode": destination,
                "outboundDepartureDateFrom": d.isoformat(),
                "outboundDepartureDateTo": d.isoformat(),
                "currency": "EUR",
            },
            headers=_HEADERS,
            timeout=10,
        )
        if not r.ok:
            return None
        fares = r.json().get("fares", [])
        return fares[0]["outbound"]["price"]["value"] if fares else None
    except Exception:
        return None


def _search_date(origin: str, destination: str, d: date) -> tuple[list, str | None]:
    """All priced flights for a single specific date."""
    scheduled_times: list[str] = []
    for day_entry in _get_timetable(origin, destination, d.year, d.month):
        if day_entry["day"] == d.day:
            scheduled_times = [f["departureTime"] for f in day_entry.get("flights", [])]
            break

    if not scheduled_times:
        return [], None

    flights = []
    with ThreadPoolExecutor(max_workers=min(len(scheduled_times), 10)) as ex:
        futures = [ex.submit(_get_flight_price, origin, destination, d, t) for t in scheduled_times]
        for future in as_completed(futures):
            result = future.result()
            if result:
                flights.append(result)

    if not flights:
        return [], "Flights are scheduled but pricing is unavailable for this date."

    return sorted(flights, key=lambda f: f["price"]), None


_IATA_RE = re.compile(r"^[A-Z]{3}$")


@router.get("/search")
def search_flights(origin: str, destination: str, date_from: date, date_to: date):
    origin = origin.strip().upper()
    destination = destination.strip().upper()

    if not _IATA_RE.match(origin) or not _IATA_RE.match(destination):
        raise HTTPException(status_code=422, detail="origin and destination must be 3-letter IATA codes")

    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    if (date_to - date_from).days > 90:
        raise HTTPException(status_code=400, detail="Date range must not exceed 90 days")

    # Fetch selected-date flights and all suggestion cheapest-prices in parallel
    with ThreadPoolExecutor(max_workers=20) as ex:
        out_future = ex.submit(_search_date, origin, destination, date_from)
        in_future = ex.submit(_search_date, destination, origin, date_to)

        sugg_futures = {
            offset: (
                ex.submit(_cheapest_for_date, origin, destination, date_from + timedelta(days=offset)),
                ex.submit(_cheapest_for_date, destination, origin, date_to + timedelta(days=offset)),
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
