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
from email_i18n import EMAIL_DARK_STYLE as _DARK_STYLE
from email_i18n import pax_label as _pax_label_i18n
from email_i18n import t as _t
from models import Route, RouteCheckLog
from routers.flights import _cheapest_for_date, _search_date

logger = logging.getLogger(__name__)
_SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() == "true"


def _google_flights_url(origin: str, destination: str, date_out: str, date_in: str | None = None) -> str:
    if date_in:
        return (
            f"https://www.google.com/flights#flt="
            f"{origin}.{destination}.{date_out}*"
            f"{destination}.{origin}.{date_in}"
        )
    return f"https://www.google.com/flights#flt={origin}.{destination}.{date_out};tt:o"


def _flight_table_html(flights: list[dict], label: str, origin: str, destination: str, d, lang: str = "en") -> str:
    rows = ""
    for i, f in enumerate(flights):
        time = f["departure_time"][11:16] if len(f["departure_time"]) >= 16 else f["departure_time"]
        badge = (
            f'<td style="padding:10px 12px;"><span class="em-badge" style="background:#eff6ff;color:#2563eb;'
            f'font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">'
            f'{_t(lang, "flight_best_price")}</span></td>'
            if i == 0 else '<td style="padding:10px 12px;"></td>'
        )
        row_cls = "em-r0" if i % 2 == 0 else "em-r1"
        bg = "#f8fafc" if i % 2 == 0 else "#ffffff"
        rows += (
            f'<tr class="{row_cls}" style="background:{bg};">'
            f'{badge}'
            f'<td class="em-td" style="padding:10px 12px;font-size:14px;color:#374151;">{f.get("airline", "")}</td>'
            f'<td class="em-td" style="padding:10px 12px;font-size:14px;color:#374151;">{f["flight_number"]}</td>'
            f'<td class="em-td" style="padding:10px 12px;font-size:14px;color:#374151;">{time}</td>'
            f'<td class="em-price" style="padding:10px 12px;font-size:14px;font-weight:700;color:#1d4ed8;">'
            f'&euro;{f["price"]:.2f}</td>'
            f'</tr>'
        )
    return (
        f'<p class="em-sub" style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;'
        f'text-transform:uppercase;letter-spacing:0.05em;">'
        f'{label} &mdash; {origin} &rarr; {destination} &mdash; {d}</p>'
        f'<table class="em-tbl" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;'
        f'border-radius:8px;overflow:hidden;margin-bottom:24px;">'
        f'<thead><tr class="em-thead" style="background:#f1f5f9;">'
        f'<th class="em-th" style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;"></th>'
        f'<th class="em-th" style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">{_t(lang, "flight_col_airline")}</th>'
        f'<th class="em-th" style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">{_t(lang, "flight_col_flight")}</th>'
        f'<th class="em-th" style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">{_t(lang, "flight_col_departs")}</th>'
        f'<th class="em-th" style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.05em;">{_t(lang, "flight_col_price")}</th>'
        f'</tr></thead>'
        f'<tbody>{rows}</tbody>'
        f'</table>'
    )


def _flight_table_text(flights: list[dict], label: str, origin: str, destination: str, d) -> str:
    lines = [f"{label} — {origin} → {destination} — {d}"]
    for i, f in enumerate(flights):
        time = f["departure_time"][11:16] if len(f["departure_time"]) >= 16 else f["departure_time"]
        prefix = "★ " if i == 0 else "  "
        airline = f.get("airline", "")
        lines.append(f"  {prefix}{airline}  {f['flight_number']}  {time}  €{f['price']:.2f}")
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
    lang: str = "en",
) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.info(
            "[scheduler] Alert email (no SMTP): %s→%s goal reached for %s",
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
        subject = _t(lang, "alert_subject_both").format(origin=origin, dest=destination)
    elif price_goal:
        price_str = f"€{total:.2f}" if total is not None else "target price"
        subject = _t(lang, "alert_subject_price").format(origin=origin, dest=destination, price=price_str)
    else:
        subject = _t(lang, "alert_subject_avail").format(origin=origin, dest=destination, date=date_from)

    _children = children_ages or []
    passengers = adults_count + len(_children)
    pax_label = _pax_label_i18n(lang, adults_count, _children)

    goal_lines_html = ""
    goal_lines_text = ""
    if price_goal and total is not None and alert_price is not None:
        per_person = total / passengers if passengers > 1 else None
        per_person_html = (
            f' <span class="em-sub" style="color:#6b7280;font-size:13px;">(&euro;{per_person:.2f} {_t(lang, "alert_per_person")})</span>'
        ) if per_person else ""
        goal_lines_html += (
            f'<p class="em-text" style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>{_t(lang, "alert_price_goal")}</strong> &mdash; '
            f'{_t(lang, "alert_group_total")} ({pax_label}): <strong>&euro;{total:.2f}</strong>{per_person_html} '
            f'({_t(lang, "alert_your_target")}: &euro;{float(alert_price):.2f})</p>'
        )
        pp_text = f" (€{per_person:.2f} {_t(lang, 'alert_per_person')})" if per_person else ""
        goal_lines_text += _t(lang, "alert_price_goal_plain").format(
            pax=pax_label, total=f"{total:.2f}", pp=pp_text, target=f"{float(alert_price):.2f}"
        ) + "\n"
    if avail_goal:
        goal_lines_html += (
            f'<p class="em-text" style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'<strong>{_t(lang, "alert_avail_goal")}</strong> &mdash; {_t(lang, "alert_avail_on_sale")}</p>'
        )
        goal_lines_text += _t(lang, "alert_avail_goal_plain") + "\n"

    google_flights_url = _google_flights_url(origin, destination, str(date_from), str(date_to))

    flights_html = ""
    flights_text = ""
    if outbound_flights:
        lbl_out = _t(lang, "alert_outbound").capitalize()
        flights_html += _flight_table_html(outbound_flights, lbl_out, origin, destination, date_from, lang)
        flights_text += _flight_table_text(outbound_flights, lbl_out, origin, destination, date_from) + "\n"
    if inbound_flights:
        lbl_in = _t(lang, "alert_return").capitalize()
        flights_html += _flight_table_html(inbound_flights, lbl_in, destination, origin, date_to, lang)
        flights_text += _flight_table_text(inbound_flights, lbl_in, destination, origin, date_to) + "\n"
    if outbound_flights and inbound_flights:
        cheapest_out = outbound_flights[0]["price"]
        cheapest_in = inbound_flights[0]["price"]
        cheapest_per_person = cheapest_out + cheapest_in
        cheapest_group = cheapest_per_person * passengers
        pp_note_html = (
            f' <span class="em-sub" style="color:#6b7280;font-size:13px;">(&euro;{cheapest_per_person:.2f} {_t(lang, "alert_per_person")})</span>'
        ) if passengers > 1 else ""
        flights_html += (
            f'<p class="em-text" style="margin:0 0 24px;font-size:15px;color:#374151;">'
            f'{_t(lang, "alert_cheapest_combo")} ({pax_label}): '
            f'<strong class="em-price" style="color:#1d4ed8;">&euro;{cheapest_out:.2f}</strong> {_t(lang, "alert_outbound")} + '
            f'<strong class="em-price" style="color:#1d4ed8;">&euro;{cheapest_in:.2f}</strong> {_t(lang, "alert_return")} '
            f'&times; {passengers} = '
            f'<strong class="em-price" style="font-size:17px;color:#1d4ed8;">&euro;{cheapest_group:.2f}</strong> {_t(lang, "alert_total")}'
            f'{pp_note_html}</p>'
        )
        pp_text = f" (€{cheapest_per_person:.2f} {_t(lang, 'alert_per_person')})" if passengers > 1 else ""
        flights_text += _t(lang, "alert_combo_plain").format(
            pax=pax_label, out=f"{cheapest_out:.2f}", ret=f"{cheapest_in:.2f}",
            n=passengers, group=f"{cheapest_group:.2f}", pp=pp_text
        ) + "\n\n"

    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>{subject}</title>
  {_DARK_STYLE}
</head>
<body class="em-bg" style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table class="em-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

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
                {_t(lang, 'alert_found')}
              </p>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:15px;line-height:1.5;">
                {origin} &rarr; {destination} &bull; {date_from} &ndash; {date_to}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="em-card" style="background-color:#ffffff;padding:36px 40px;">
              {goal_lines_html}

              {flights_html}

              <!-- CTA buttons -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{google_flights_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      {_t(lang, 'alert_search_gf')}
                    </a>
                  </td>
                  <td style="width:12px;"></td>
                  <td class="em-sec" style="background-color:#e2e8f0;border-radius:10px;">
                    <a href="{frontend_url}" class="em-link"
                       style="display:inline-block;padding:14px 32px;color:#1e40af;font-size:15px;font-weight:600;text-decoration:none;">
                      {_t(lang, 'alert_search_ec')}
                    </a>
                  </td>
                </tr>
              </table>

              <hr class="em-hr" style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p class="em-muted" style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                {_t(lang, 'alert_deactivated')}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="em-footer" style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
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
        f"{_t(lang, 'alert_plain_intro')}\n\n"
        f"Route: {origin} → {destination}\n"
        f"Dates: {date_from} – {date_to}\n\n"
        f"{goal_lines_text}\n"
        f"{flights_text}"
        f"{_t(lang, 'alert_plain_deactivated')}\n"
        f"{_t(lang, 'alert_plain_new_search')} {frontend_url}\n\n"
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
    lang: str = "en",
) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.info(
            "[scheduler] Expired email (no SMTP): %s→%s unmet goal for %s",
            origin, destination, to_email,
        )
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", smtp_user)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    subject = _t(lang, "expired_subject").format(origin=origin, dest=destination)

    goal_lines_html = ""
    goal_lines_text = ""
    if alert_price is not None:
        price_str = _t(lang, "expired_price_target").format(price=f"{float(alert_price):.2f}")
        goal_lines_html += (
            f'<p class="em-text" style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'{price_str}</p>'
        )
        goal_lines_text += price_str + "\n"
    if notify_available:
        avail_str = _t(lang, "expired_avail_alert")
        goal_lines_html += (
            f'<p class="em-text" style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">'
            f'{avail_str}</p>'
        )
        goal_lines_text += avail_str + "\n"

    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>{subject}</title>
  {_DARK_STYLE}
</head>
<body class="em-bg" style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table class="em-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

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
                {_t(lang, 'expired_header')}
              </p>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:15px;line-height:1.5;">
                {origin} &rarr; {destination} &bull; {date_from} &ndash; {date_to}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="em-card" style="background-color:#ffffff;padding:36px 40px;">
              <p class="em-text" style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                {_t(lang, 'expired_body')}
              </p>

              <p class="em-sub" style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">{_t(lang, 'expired_criteria')}</p>
              {goal_lines_html}

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin:24px 0 28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{frontend_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      {_t(lang, 'expired_button')}
                    </a>
                  </td>
                </tr>
              </table>

              <hr class="em-hr" style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p class="em-muted" style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                {_t(lang, 'expired_removed')}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="em-footer" style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
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
        f"{_t(lang, 'expired_plain_intro')}\n\n"
        f"Route: {origin} → {destination}\n"
        f"Dates: {date_from} – {date_to}\n\n"
        f"{_t(lang, 'expired_criteria')}:\n{goal_lines_text}\n"
        f"{_t(lang, 'expired_plain_passed')}\n"
        f"{_t(lang, 'expired_plain_new')} {frontend_url}\n\n"
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
    user_email = route.user.email if route.user else None
    user_lang = getattr(route.user, "language", "en") if route.user else "en"
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
        "[scheduler] Expired %s→%s (departure %s passed without goal met)",
        origin, destination, date_from,
    )

    if user_email:
        _send_expired_email(user_email, origin, destination, date_from, date_to, alert_price, notify_available, lang=user_lang)


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
            total_price=Decimal(str(group_total)) if group_total is not None else None,
            flights_found=flights_found,
            price_goal_reached=price_goal_reached,
            available_goal_reached=available_goal_reached,
        )
        db.add(log)

        goal_reached = price_goal_reached or available_goal_reached
        user_email = route.user.email if route.user else None
        user_lang = getattr(route.user, "language", "en") if route.user else "en"

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
                lang=user_lang,
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
