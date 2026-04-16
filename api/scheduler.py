"""
Hourly background job that checks every active saved route with an alert
configured (price alert, availability alert, or both) and writes a
RouteCheckLog record for each check.
"""
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
from routers.flights import _cheapest_for_date

logger = logging.getLogger(__name__)


def _send_alert_email(
    to_email: str,
    route: Route,
    price_goal: bool,
    avail_goal: bool,
    total: float | None,
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

    # Build the "what triggered" section for HTML
    goal_lines_html = ""
    goal_lines_text = ""
    if price_goal and total is not None and alert_price is not None:
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>Price goal reached</strong> &mdash; current total: '
            f'<strong>&euro;{total:.2f}</strong> (your target: &euro;{float(alert_price):.2f})</p>'
        )
        goal_lines_text += f"Price goal reached — current total: €{total:.2f} (your target: €{float(alert_price):.2f})\n"
    if avail_goal:
        goal_lines_html += (
            f'<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>Availability goal reached</strong> &mdash; outbound flights are now on sale.</p>'
        )
        goal_lines_text += "Availability goal reached — outbound flights are now on sale.\n"

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
                Your alert has been triggered!
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

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{frontend_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Search flights now
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
            if smtp_user:
                smtp.starttls()
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        logger.error("[scheduler] Failed to send alert email to %s: %s", to_email, exc)


def check_routes() -> int:
    """Entry point called by APScheduler every hour. Returns number of routes checked."""
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

        return len(routes)
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

        goal_reached = price_goal_reached or available_goal_reached
        user_email = route.user.email if route.user else None

        if goal_reached:
            route.is_active = False
            logger.info("[scheduler] Goal reached for route %s — deactivating", route.id)

        db.commit()

        if goal_reached and user_email:
            _send_alert_email(user_email, route, price_goal_reached, available_goal_reached, total)

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
