"""
Hourly background job that checks every active saved route with an alert
configured (price alert, availability alert, or both) and writes a
RouteCheckLog record for each check.
"""
import logging
from datetime import date
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Route, RouteCheckLog
from routers.flights import _cheapest_for_date

logger = logging.getLogger(__name__)


def check_routes() -> None:
    """Entry point called by APScheduler every hour."""
    db = SessionLocal()
    try:
        routes = db.query(Route).filter(
            Route.is_active == True,  # noqa: E712
            Route.date_from >= date.today(),
            or_(Route.alert_price.isnot(None), Route.notify_available == True),  # noqa: E712
        ).all()

        logger.info("[scheduler] Checking %d route(s)", len(routes))

        for route in routes:
            _check_route(db, route)
    finally:
        db.close()


def _check_route(db: Session, route: Route) -> None:
    try:
        out_price = _cheapest_for_date(route.origin, route.destination, route.date_from)
        in_price = _cheapest_for_date(route.destination, route.origin, route.date_to)

        total: float | None = None
        if out_price is not None and in_price is not None:
            total = out_price + in_price

        flights_found = out_price is not None

        price_goal_reached = bool(
            route.alert_price is not None
            and total is not None
            and Decimal(str(total)) <= route.alert_price
        )
        available_goal_reached = bool(route.notify_available and flights_found)

        log = RouteCheckLog(
            route_id=route.id,
            outbound_price=Decimal(str(out_price)) if out_price is not None else None,
            inbound_price=Decimal(str(in_price)) if in_price is not None else None,
            total_price=Decimal(str(total)) if total is not None else None,
            flights_found=flights_found,
            price_goal_reached=price_goal_reached,
            available_goal_reached=available_goal_reached,
        )
        db.add(log)
        db.commit()

        logger.info(
            "[scheduler] %s→%s out=%.2f in=%.2f total=%s price_goal=%s avail_goal=%s",
            route.origin,
            route.destination,
            out_price or 0,
            in_price or 0,
            f"{total:.2f}" if total is not None else "n/a",
            price_goal_reached,
            available_goal_reached,
        )

    except Exception as exc:
        logger.error("[scheduler] Error checking route %s: %s", route.id, exc)
        try:
            db.add(RouteCheckLog(route_id=route.id, error=str(exc)[:500]))
            db.commit()
        except Exception:
            db.rollback()
