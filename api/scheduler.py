"""
Hourly background job that checks every active saved route with an alert
configured (price alert, availability alert, or both) and writes a
RouteCheckLog record for each check.
"""
import json
import logging
import os
import smtplib
from datetime import date
from decimal import Decimal
from email.message import EmailMessage

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Route, RouteCheckLog
from routers.flights import _cheapest_for_date, _search_date

logger = logging.getLogger(__name__)
_SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() == "true"


def _pax_label(adults: int, children_ages: list[int]) -> str:
    """Human-readable passenger summary, e.g. '2 adults, 1 child (age 5)'."""
    parts = [f"{adults} adult{'s' if adults != 1 else ''}"]
    n = len(children_ages)
    if n == 1:
        age = children_ages[0]
        kind = "infant" if age < 2 else "child"
        parts.append(f"1 {kind} (age {age})")
    elif n > 1:
        ages_str = ", ".join(str(a) for a in children_ages)
        parts.append(f"{n} children (ages {ages_str})")
    return ", ".join(parts)


def _google_flights_url(origin: str, destination: str, date_out: str, date_in: str | None = None) -> str:
    if date_in:
        return (
            f"https://www.google.com/flights#flt="
            f"{origin}.{destination}.{date_out}*"
            f"{destination}.{origin}.{date_in}"
        )
    return f"https://www.google.com/flights#flt={origin}.{destination}.{date_out};tt:o"


def _flight_table_html(flights: list[dict], label: str, origin: str, destination: str, d) -> str:
    rows = ""
    for i, f in enumerate(flights):
        time = f["departure_time"][11:16] if len(f["departure_time"]) >= 16 else f["departure_time"]
        badge = (
            '<td style="padding:10px 12px;"><span style="background:#eff6ff;color:#2563eb;'
            'font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Best price</span></td>'
            if i == 0 else '<td style="padding:10px 12px;"></td>'
        )
        bg = "#f8fafc" if i % 2 == 0 else "#ffffff"
        rows += (
            f'<tr style="background:{bg};">'
            f'{badge}'
            f'<td style="padding:10px 12px;font-size:14px;color:#374151;">{f["flight_number"]}</td>'
            f'<td style="padding:10px 12px;font-size:14px;color:#374151;">{time}</td>'
            f'<td style="padding:10px 12px;font-size:14px;font-weight:700;color:#1d4ed8;">'
            f'&euro;{f["price"]:.2f}</td>'
            f'</tr>'
        )
    return (
        f'<p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;'
        f'text-transform:uppercase;letter-spacing:0.05em;">'
        f'{label} &mdash; {origin} &rarr; {destination} &mdash; {d}</p>'
        f'<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;'
        f'border-radius:8px;overflow:hidden;margin-bottom:24px;">'
        f'<thead><tr style="background:#f1f5f9;">'
        f'<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;"></th>'
        f'<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">Flight</th>'
        f'<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">Departs</th>'
        f'<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">Price</th>'
        f'</tr></thead>'
        f'<tbody>{rows}</tbody>'
        f'</table>'
    )


def _flight_table_text(flights: list[dict], label: str, origin: str, destination: str, d) -> str:
    lines = [f"{label} — {origin} → {destination} — {d}"]
    for i, f in enumerate(flights):
        time = f["departure_time"][11:16] if len(f["departure_time"]) >= 16 else f["departure_time"]
        prefix = "★ " if i == 0 else "  "
        lines.append(f"  {prefix}{f['flight_number']}  {time}  €{f['price']:.2f}")
    return "\n".join(lines) + "\n"


def _send_alert_email(
    to_email: str,
    route: Route,
    price_goal: bool,
    avail_goal: bool,
    total: float | None,
    adults_count: int = 1,
    children_ages: list[int] | None = None,
    outbound_flights: list[dict] | None = None,
    inbound_flights: list[dict] | None = None,
) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.info(
            "[scheduler] Alert email (no SMTP): %s\u2192%s goal reached for %s",
            route.origin, route.destination, to_email,
        )
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", smtp_user)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    origin = route.origin
    destination = route.destination
    date_from = route.date_from
    date_to = route.date_to
    alert_price = route.alert_price

    if price_goal and avail_goal:
        subject = f"Goal reached: {origin}\u2192{destination}"
    elif price_goal:
        price_str = f"\u20ac{total:.2f}" if total is not None else "target price"
        subject = f"Price alert: {origin}\u2192{destination} is now {price_str}"
    else:
        subject = f"Flights available: {origin}\u2192{destination} on {date_from}"

    # Passenger breakdown
    _children = children_ages or []
    passengers = adults_count + len(_children)
    pax_label = _pax_label(adults_count, _children)

    # Build the "what triggered" section for HTML
    goal_lines_html = ""
    goal_lines_text = ""
    if price_goal and total is not None and alert_price is not None:
        per_person = total / passengers if passengers > 1 else None
        per_person_html = (
            f' <span style="color:#6b7280;font-size:13px;">'
            f'(&euro;{per_person:.2f} per person)</span>'
        ) if per_person else ""
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>Price goal reached</strong> &mdash; '
            f'group total ({pax_label}): <strong>&euro;{total:.2f}</strong>{per_person_html} '
            f'(your target: &euro;{float(alert_price):.2f})</p>'
        )
        pp_text = f" (€{per_person:.2f} per person)" if per_person else ""
        goal_lines_text += f"Price goal reached — group total ({pax_label}): €{total:.2f}{pp_text} (your target: €{float(alert_price):.2f})\n"
    if avail_goal:
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>Availability goal reached</strong> &mdash; outbound flights are now on sale.</p>'
        )
        goal_lines_text += "Availability goal reached — outbound flights are now on sale.\n"

    google_flights_url = _google_flights_url(origin, destination, str(date_from), str(date_to))

    # Flight tables
    flights_html = ""
    flights_text = ""
    if outbound_flights:
        flights_html += _flight_table_html(outbound_flights, "Outbound", origin, destination, date_from)
        flights_text += _flight_table_text(outbound_flights, "Outbound", origin, destination, date_from) + "\n"
    if inbound_flights:
        flights_html += _flight_table_html(inbound_flights, "Return", destination, origin, date_to)
        flights_text += _flight_table_text(inbound_flights, "Return", destination, origin, date_to) + "\n"
    if outbound_flights and inbound_flights:
        cheapest_out = outbound_flights[0]["price"]
        cheapest_in = inbound_flights[0]["price"]
        cheapest_per_person = cheapest_out + cheapest_in
        cheapest_group = cheapest_per_person * passengers
        pp_note_html = (
            f' <span style="color:#6b7280;font-size:13px;">(&euro;{cheapest_per_person:.2f} per person)</span>'
        ) if passengers > 1 else ""
        flights_html += (
            f'<p style="margin:0 0 24px;font-size:15px;color:#374151;">'
            f'Cheapest combination ({pax_label}): '
            f'<strong style="color:#1d4ed8;">&euro;{cheapest_out:.2f}</strong> outbound + '
            f'<strong style="color:#1d4ed8;">&euro;{cheapest_in:.2f}</strong> return '
            f'&times; {passengers} = '
            f'<strong style="font-size:17px;color:#1d4ed8;">&euro;{cheapest_group:.2f}</strong> total'
            f'{pp_note_html}</p>'
        )
        pp_text = f" (€{cheapest_per_person:.2f} per person)" if passengers > 1 else ""
        flights_text += f"Cheapest combination ({pax_label}): €{cheapest_out:.2f} + €{cheapest_in:.2f} × {passengers} = €{cheapest_group:.2f} total{pp_text}\n\n"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background-color:#1e40af;border-radius:16px 16px 0 0;padding:36px 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2d55c8;border-radius:10px;padding:8px 10px;vertical-align:middle;">
                    <span style="font-size:20px;line-height:1;">&#9992;&#65039;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;">El Cheapo</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">
                We have found your flight!
              </p>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:15px;line-height:1.5;">
                {origin} &rarr; {destination} &bull; {date_from} &ndash; {date_to}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;">
              {goal_lines_html}

              {flights_html}

              <!-- CTA buttons -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{google_flights_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Search on Google Flights
                    </a>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="background-color:#e2e8f0;border-radius:10px;">
                    <a href="{frontend_url}"
                       style="display:inline-block;padding:14px 32px;color:#1e40af;font-size:15px;font-weight:600;text-decoration:none;">
                      Search El Cheapo
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                This route has been deactivated and will no longer trigger alerts.
                You can save a new search at any time.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                &#169; El Cheapo &middot; Sent to {to_email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    plain = (
        f"Your El Cheapo alert has been triggered!\n\n"
        f"Route: {origin} → {destination}\n"
        f"Dates: {date_from} – {date_to}\n\n"
        f"{goal_lines_text}\n"
        f"{flights_text}"
        f"This route has been deactivated and will no longer trigger alerts.\n"
        f"You can save a new search at: {frontend_url}\n\n"
        f"— El Cheapo\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(host, port) as smtp:
            if _SMTP_TLS:
                smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        logger.error("[scheduler] Failed to send alert email to %s: %s", to_email, exc)


def _send_expired_email(
    to_email: str,
    origin: str,
    destination: str,
    date_from,
    date_to,
    alert_price,
    notify_available: bool,
) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.info(
            "[scheduler] Expired email (no SMTP): %s\u2192%s unmet goal for %s",
            origin, destination, to_email,
        )
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", smtp_user)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    subject = f"Your search for {origin}\u2192{destination} has expired"

    goal_lines_html = ""
    goal_lines_text = ""
    if alert_price is not None:
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'Price target: <strong>&euro;{float(alert_price):.2f}</strong> combined return</p>'
        )
        goal_lines_text += f"Price target: €{float(alert_price):.2f} combined return\n"
    if notify_available:
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'Availability alert: notify when any outbound flight appears</p>'
        )
        goal_lines_text += "Availability alert: notify when any outbound flight appears\n"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background-color:#1e40af;border-radius:16px 16px 0 0;padding:36px 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2d55c8;border-radius:10px;padding:8px 10px;vertical-align:middle;">
                    <span style="font-size:20px;line-height:1;">&#9992;&#65039;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;">El Cheapo</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">
                Unfortunately, we could not find a flight that meets your criteria.
              </p>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:15px;line-height:1.5;">
                {origin} &rarr; {destination} &bull; {date_from} &ndash; {date_to}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                The departure date for your tracked route has now passed. Despite checking every hour,
                no flight matching your criteria became available in time.
              </p>

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your criteria</p>
              {goal_lines_html}

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin:24px 0 28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{frontend_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Search for new flights
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                This saved search has been removed. You can set up a new alert at any time.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                &#169; El Cheapo &middot; Sent to {to_email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    plain = (
        f"Unfortunately, we could not find a flight that meets your criteria.\n\n"
        f"Route: {origin} → {destination}\n"
        f"Dates: {date_from} – {date_to}\n\n"
        f"Your criteria:\n{goal_lines_text}\n"
        f"The departure date has now passed. This saved search has been removed.\n"
        f"You can set up a new alert at: {frontend_url}\n\n"
        f"— El Cheapo\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(host, port) as smtp:
            if _SMTP_TLS:
                smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        logger.error("[scheduler] Failed to send expired email to %s: %s", to_email, exc)


def expire_routes() -> int:
    """Delete active routes whose departure has passed without meeting their goal.
    Sends a notification email to the user for each expired route. Returns count deleted."""
    db = SessionLocal()
    try:
        expired = db.query(Route).filter(
            Route.is_active == True,  # noqa: E712
            Route.date_from < date.today(),
            or_(Route.alert_price.isnot(None), Route.notify_available == True),  # noqa: E712
        ).all()

        logger.info("[scheduler] Expiring %d route(s) with unmet goals", len(expired))

        for route in expired:
            _expire_route(db, route)

        return len(expired)
    finally:
        db.close()


def _expire_route(db: Session, route: Route) -> None:
    # Capture values before deletion
    user_email = route.user.email if route.user else None
    origin = route.origin
    destination = route.destination
    date_from = route.date_from
    date_to = route.date_to
    alert_price = route.alert_price
    notify_available = route.notify_available

    db.query(RouteCheckLog).filter(RouteCheckLog.route_id == route.id).delete()
    db.delete(route)
    db.commit()

    logger.info(
        "[scheduler] Expired %s\u2192%s (departure %s passed without goal met)",
        origin, destination, date_from,
    )

    if user_email:
        _send_expired_email(user_email, origin, destination, date_from, date_to, alert_price, notify_available)


def check_routes() -> int:
    """Entry point called by APScheduler every hour. Returns number of routes checked."""
    db = SessionLocal()
    checked = 0
    try:
        routes = db.query(Route).filter(
            Route.is_active == True,  # noqa: E712
            Route.date_from >= date.today(),
            or_(Route.alert_price.isnot(None), Route.notify_available == True),  # noqa: E712
        ).all()

        logger.info("[scheduler] Checking %d route(s)", len(routes))
        checked = len(routes)

        for route in routes:
            _check_route(db, route)
    finally:
        db.close()

    expire_routes()
    return checked


def _check_route(db: Session, route: Route) -> None:
    try:
        out_price = _cheapest_for_date(route.origin, route.destination, route.date_from)
        in_price = _cheapest_for_date(route.destination, route.origin, route.date_to)

        total: float | None = None
        if out_price is not None and in_price is not None:
            total = out_price + in_price

        flights_found = out_price is not None
        adults_count = route.adults_count if route.adults_count is not None else (route.passengers or 1)
        children_ages = json.loads(route.children_ages or "[]")
        passengers = adults_count + len(children_ages)
        group_total = total * passengers if total is not None else None

        price_goal_reached = bool(
            route.alert_price is not None
            and group_total is not None
            and Decimal(str(group_total)) <= route.alert_price
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

        goal_reached = price_goal_reached or available_goal_reached
        user_email = route.user.email if route.user else None

        if goal_reached:
            route.is_active = False
            logger.info("[scheduler] Goal reached for route %s — deactivating", route.id)

        db.commit()

        if goal_reached and user_email:
            out_flights, _ = _search_date(route.origin, route.destination, route.date_from)
            in_flights, _ = _search_date(route.destination, route.origin, route.date_to)
            _send_alert_email(
                user_email, route, price_goal_reached, available_goal_reached,
                group_total,
                adults_count=adults_count,
                children_ages=children_ages,
                outbound_flights=out_flights or None,
                inbound_flights=in_flights or None,
            )

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
