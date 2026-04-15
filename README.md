# El Cheapo ✈️

A Ryanair flight price monitor that helps budget travellers find the best deals. Search any route and date range to get real-time pricing, with automatic suggestions for the cheapest ±3-day window around your chosen dates.

---

## Features

- **Flight search** — real-time prices pulled from Ryanair's API for any origin/destination pair
- **Price suggestions** — cheapest outbound + inbound prices for 7 date combinations (−3 to +3 days)
- **Airport autocomplete** — fast local search across all IATA codes
- **User accounts** — register, log in, and reset your password via a styled HTML email
- **Saved searches** — save any route search to your account; view, edit, and delete from a dedicated page sorted by departure date with sort and filter controls
- **Alert options** — set a max price alert, an availability alert (notify when any flight appears), or both when saving a search
- **Hourly route checker** — background scheduler checks every active route with an alert and logs prices found, goal status, and any errors to the database
- **Admin panel** — site admin can view all users with search counts, browse the last 200 scheduler logs, and manually trigger the route checker
- **Fully containerised** — one `docker compose up` gets you a running stack

---

## Tech stack

| Layer | Technology |
|---|---|
| **API** | Python 3.12, FastAPI, SQLAlchemy 2.0, psycopg2 |
| **Auth** | JWT (python-jose), bcrypt (passlib) |
| **Scheduling** | APScheduler (hourly route checker) |
| **Database** | PostgreSQL 16 |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Flight data** | Ryanair unofficial API (ryanair-py + direct HTTP) |
| **Testing** | pytest, pytest-cov, httpx, vitest, @testing-library/react |
| **Infra** | Docker, Docker Compose |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2)
- Git

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/fleenstra/cheapflights.git
cd cheapflights
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set a strong `SECRET_KEY`. The default Postgres credentials are fine for local use. SMTP settings are optional — if left blank the password-reset link is printed to the API container logs instead of emailed.

```env
POSTGRES_USER=cheapflights
POSTGRES_PASSWORD=changeme
POSTGRES_DB=cheapflights
SECRET_KEY=your-very-secret-key-here

# Optional — required to send password-reset emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=you@gmail.com
FRONTEND_URL=http://localhost:5173
```

### 3. Start the stack

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Mailpit (catch-all email UI) | http://localhost:8025 |
| PostgreSQL | localhost:5432 |

The API creates all database tables and a default admin account on first startup.

Password-reset emails are caught by **Mailpit** — open http://localhost:8025 to read them. No real email is sent in local development. To use a real mail provider in production, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to your provider's credentials.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `POSTGRES_DB` | Yes | — | PostgreSQL database name |
| `SECRET_KEY` | Yes | `change-me-in-production` | JWT signing key — **change this** |
| `DATABASE_URL` | No | derived from the above | Full SQLAlchemy connection string (set automatically by Docker Compose) |
| `FRONTEND_URL` | No | `http://localhost:5173` | Base URL used in password-reset email links |
| `COOKIE_SECURE` | No | `false` | Set to `true` in production (HTTPS) to add the `Secure` flag to the auth cookie |
| `SMTP_HOST` | No | — | SMTP server hostname. If unset, reset links are logged to stdout |
| `SMTP_PORT` | No | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | No | — | SMTP login username |
| `SMTP_PASSWORD` | No | — | SMTP login password |
| `SMTP_FROM` | No | same as `SMTP_USER` | From address on outgoing emails |
| `ADMIN_EMAIL` | No | `admin@elcheeapo.com` | Email address granted admin access; a matching user is created on first startup |

---

## API endpoints

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/auth/register` | `{ "email": "...", "password": "..." }` | Register a new user; sets httpOnly auth cookie and returns JWT |
| `POST` | `/auth/login` | `{ "email": "...", "password": "..." }` | Log in; sets httpOnly auth cookie and returns JWT. **Rate limited: 10 requests/minute per IP** |
| `POST` | `/auth/logout` | — | Clear the auth cookie |
| `GET` | `/auth/me` | — | Return `{ "id", "email", "is_admin" }` for the authenticated user |
| `POST` | `/auth/forgot-password` | `{ "email": "..." }` | Send a password-reset link (always returns 200). **Rate limited: 5 requests/minute per IP** |
| `POST` | `/auth/reset-password` | `{ "token": "...", "password": "..." }` | Set a new password using a reset token |

Password rules: minimum 8 characters, maximum 128 characters.

### Routes

All routes endpoints require authentication. The browser sends the httpOnly cookie automatically. API clients can alternatively pass an `Authorization: Bearer <token>` header.

| Method | Path | Body / params | Description |
|---|---|---|---|
| `GET` | `/routes/` | — | List all saved routes for the authenticated user |
| `POST` | `/routes/` | see below | Save a route search to the authenticated user's account |
| `PUT` | `/routes/{id}` | see below | Update an existing saved route (same body as POST) |
| `DELETE` | `/routes/{id}` | — | Delete a saved route (404 if not found or owned by another user) |

#### Save route body

```json
{
  "origin": "DUB",
  "destination": "BCN",
  "date_from": "2025-08-01",
  "date_to": "2025-08-08",
  "alert_price": 49,
  "notify_available": false
}
```

`alert_price` is optional. When provided it must be a whole number (integer, no decimals) and represents the **maximum combined price for the full return trip** (outbound + inbound).

`notify_available` is optional (default `false`). When `true`, the user will be notified as soon as any flight becomes available on the route, regardless of price.

Both alert options can be set independently or together. Returns `{ "id": "<uuid>" }` on success.

Saving a route with the same `origin`, `destination`, `date_from`, and `date_to` as an existing saved search for the same user returns **409 Conflict**.

#### Password reset flow

1. User visits `/forgot-password` and submits their email.
2. The API generates a single-use token (valid for 1 hour), stores it, and emails a link to `FRONTEND_URL/reset-password?token=<token>`. If no SMTP is configured the link is printed to the API logs.
3. User clicks the link, enters a new password on `/reset-password`.
4. The API validates the token (not expired, not already used), updates the password hash, and marks the token as used.
5. User is redirected to the login page.

### Flights

| Method | Path | Query params | Description |
|---|---|---|---|
| `GET` | `/flights/search` | `origin`, `destination`, `date_from`, `date_to` | Search flights for a route and date range (max 90 days between dates) |

#### Example request

```
GET /flights/search?origin=DUB&destination=BCN&date_from=2025-08-01&date_to=2025-08-08
```

#### Example response

```json
{
  "outbound": {
    "flights": [
      {
        "flight_number": "FR1234",
        "price": 29.99,
        "currency": "EUR",
        "origin": "DUB",
        "origin_full": "Dublin, Ireland",
        "destination": "BCN",
        "destination_full": "Barcelona, Spain",
        "departure_time": "2025-08-01T06:00:00"
      }
    ],
    "error": null
  },
  "inbound": {
    "flights": [...],
    "error": null
  },
  "suggestions": [
    {
      "offset": -3,
      "outbound_date": "2025-07-29",
      "inbound_date": "2025-08-05",
      "outbound_cheapest": 19.99,
      "inbound_cheapest": 24.99,
      "total": 44.98,
      "is_selected": false
    },
    {
      "offset": 0,
      "outbound_date": "2025-08-01",
      "inbound_date": "2025-08-08",
      "outbound_cheapest": 29.99,
      "inbound_cheapest": 34.99,
      "total": 64.98,
      "is_selected": true
    }
  ],
  "currency": "EUR"
}
```

### Admin

All endpoints require the authenticated user to be the admin (email matches `ADMIN_EMAIL`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users with email, join date, and saved-search count |
| `GET` | `/admin/logs` | Last 200 scheduler check logs with route info, prices, and goal flags |
| `POST` | `/admin/run-check` | Trigger the hourly scheduler job immediately; returns `{ "routes_checked": N }` |

### Health

```
GET /health  →  { "status": "ok" }
```

Full interactive docs are available at `http://localhost:8000/docs` when the stack is running.

---

## Running tests

### Backend (pytest + coverage)

```bash
docker compose run --rm test pytest tests/ -v --cov=. --cov-report=term-missing
```

The test suite uses an in-memory SQLite database for full isolation. All Ryanair API calls are mocked — no network access required.

Current coverage: **99%** across all source files (132 tests; `routers/routes.py` and `models.py` at 100%).

### Frontend (vitest)

```bash
cd frontend
npm install
npm test
```

---

## Project structure

```
cheapflights/
├── api/
│   ├── main.py              # FastAPI app, CORS, security headers, startup event
│   ├── config.py            # Shared constants (ADMIN_EMAIL)
│   ├── database.py          # SQLAlchemy engine + session + get_db
│   ├── limiter.py           # Shared slowapi rate-limiter instance
│   ├── models.py            # ORM models: User, Route, RouteCheckLog, Flight, Alert, PasswordResetToken
│   ├── scheduler.py         # Hourly job: checks routes against alert goals, writes RouteCheckLog
│   ├── routers/
│   │   ├── admin.py         # GET /admin/users, GET /admin/logs, POST /admin/run-check
│   │   ├── auth.py          # register, login, logout, me, forgot-password, reset-password + JWT dependency
│   │   ├── flights.py       # GET /flights/search + Ryanair API logic
│   │   └── routes.py        # GET/POST/PUT/DELETE /routes/
│   ├── tests/
│   │   ├── conftest.py      # SQLite test client + fixtures
│   │   ├── test_admin.py
│   │   ├── test_auth.py
│   │   ├── test_database.py
│   │   ├── test_flights.py
│   │   ├── test_health.py
│   │   ├── test_models.py
│   │   ├── test_routes.py
│   │   └── test_scheduler.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Router (Login, Register, ForgotPassword, ResetPassword, Search, SavedSearches, Admin)
│   │   ├── pages/           # Login, Register, ForgotPassword, ResetPassword, Search, SavedSearches, Admin
│   │   ├── components/      # Navbar, AirportInput, DateRangePicker, FlightList, PriceSuggestions
│   │   └── data/
│   │       └── airports.ts  # IATA code database
│   ├── package.json
│   ├── vite.config.ts       # Dev server + /api proxy
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## How it works

1. The user enters an origin, destination, and outbound/inbound dates.
2. The API fetches the Ryanair timetable for the selected month to find all scheduled departure times.
3. For each scheduled departure, it fires a parallel fare request (up to 10 concurrent threads) to get the exact price.
4. In parallel, it fetches the single cheapest price for each of the 6 surrounding dates (±3 days, both directions) to build the suggestions grid.
5. Results are sorted cheapest-first and returned to the frontend.

### Background route checker

Every hour APScheduler runs `check_routes()`, which:

1. Queries all active routes with a future departure date and at least one alert set (`alert_price` or `notify_available`).
2. For each route, fetches the cheapest outbound and inbound price from Ryanair.
3. Evaluates whether the price goal (total ≤ `alert_price`) and/or availability goal (any outbound flight exists) are met.
4. Writes a `RouteCheckLog` row recording the prices found, goal flags, and any error.

The log accumulates over time and will be used to trigger email notifications (see roadmap).

---

## Roadmap

- [x] Password reset via styled HTML email
- [x] Save route searches with optional price alert and/or availability alert
- [x] Saved searches page with sort (departure date, newest, origin, destination) and filter (price alert, availability, no alert) controls
- [x] Click a saved search to immediately run it
- [x] Hourly background scheduler checks routes and logs results to `route_check_logs`
- [x] Admin panel — users list, scheduler logs, manual trigger
- [ ] Price alert emails when a saved route drops below the target price
- [ ] Availability alert emails when flights open on a tracked route
- [ ] Return-trip total in the main results view
- [ ] Support for multi-month searches
- [ ] Other airlines beyond Ryanair

---

## License

MIT
