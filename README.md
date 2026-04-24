# El Cheapo ✈️

A multi-airline flight price monitor that helps budget travellers find the best deals. Search any route and date range to get real-time pricing across all airlines, with automatic suggestions for the cheapest ±3-day window around your chosen dates.

---

## Features

- **Flight search** — real-time prices pulled from Google Flights for any origin/destination pair across all airlines; non-stop results only; each flight card shows the airline logo
- **Price suggestions** — cheapest outbound + inbound prices for 7 date combinations (−3 to +3 days)
- **Airport autocomplete** — fast local search across 7,000+ commercial airports worldwide; each result shows the full airport name (e.g. Amsterdam Airport Schiphol) and country name in the user's language
- **User accounts** — register, log in, and reset your password via a styled HTML email
- **Saved searches** — save any route search to your account; view, edit, and delete from a dedicated page sorted by departure date with sort and filter controls
- **Multi-passenger support** — search and track routes for 1–9 passengers; all totals (cheapest summary and alert threshold) are calculated for the full group
- **Alert options** — set a max group price alert, an availability alert (notify when any flight appears), or both when saving a search
- **Hourly route checker** — background scheduler checks every active route with an alert, logs results, and deactivates the route once its goal is met
- **Goal reached indicator** — saved searches show a green "Goal reached" banner with the exact timestamp when a price or availability goal was first met
- **User profile** — set a default departure airport and travel group (adults + children) to pre-fill the search form; choose light, dark, or device-matched theme
- **Internationalisation** — UI and alert emails available in 8 languages: English, Dutch, French, German, Polish, Italian, Spanish, and Portuguese; language is auto-detected from the browser and can be changed from the navbar
- **Admin panel** — admins can view all users, browse scheduler logs grouped by run, manually trigger the route checker, and promote/demote other users to admin; admin accounts cannot be deleted
- **Fully containerised** — one `docker compose up` gets you a running stack

---

## Tech stack

| Layer | Technology |
|---|---|
| **API** | Python 3.13, FastAPI, SQLAlchemy 2.0, psycopg2 |
| **Auth** | JWT (python-jose), bcrypt |
| **Scheduling** | APScheduler (hourly route checker) |
| **Database** | PostgreSQL 17 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Flight data** | Google Flights via `flights` (fli) library — reverse-engineered API |
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

Open `.env` and set a strong `SECRET_KEY` and `ADMIN_PASSWORD`. The default Postgres credentials are fine for local use. SMTP settings are optional — if left blank the password-reset link and goal-reached alerts are printed to the API container logs instead of emailed.

```env
POSTGRES_USER=cheapflights
POSTGRES_PASSWORD=changeme
POSTGRES_DB=cheapflights
SECRET_KEY=your-very-secret-key-here
ADMIN_PASSWORD=your-admin-password-here

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

### Default accounts

The admin account is created automatically on first startup using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables (see `.env.example` for defaults). Log in with those credentials to access the admin panel at `/admin`.

Password-reset emails and goal-reached alert emails are caught by **Mailpit** — open http://localhost:8025 to read them. No real email is sent in local development. To use a real mail provider in production, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to your provider's credentials.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `POSTGRES_DB` | Yes | — | PostgreSQL database name |
| `SECRET_KEY` | Yes | `change-me-in-production` | JWT signing key — **change this**; app refuses to start if missing or still set to the example value |
| `ADMIN_PASSWORD` | Yes | — | Password for the seeded admin account — **change this** |
| `DATABASE_URL` | No | derived from the above | Full SQLAlchemy connection string (set automatically by Docker Compose) |
| `ADMIN_EMAIL` | No | `admin@elcheeapo.com` | Email address granted admin access; a matching user is created on first startup |
| `FRONTEND_URL` | No | `http://localhost:5173` | Base URL used in password-reset and account-deletion email links |
| `COOKIE_SECURE` | No | `false` | Set to `true` in production (HTTPS) to add the `Secure` flag to the auth cookie |
| `SMTP_HOST` | No | — | SMTP server hostname. If unset, reset links and alert emails are logged to stdout |
| `SMTP_PORT` | No | `587` | SMTP port (STARTTLS) |
| `SMTP_TLS` | No | `true` | Set to `false` for local Mailpit (no TLS) |
| `SMTP_USER` | No | — | SMTP login username |
| `SMTP_PASSWORD` | No | — | SMTP login password |
| `SMTP_FROM` | No | same as `SMTP_USER` | From address on outgoing emails |

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
| `POST` | `/auth/request-delete-account` | — | Send an account-deletion confirmation email (requires auth) |
| `DELETE` | `/auth/delete-account?token=...` | — | Permanently delete the account and all data using the token from the email |

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
  "passengers": 3,
  "adults_count": 2,
  "children_ages": [7],
  "alert_price": 98,
  "notify_available": false
}
```

`passengers` is optional (default `1`, max `9`) — total group size. For proper per-category booking links and readable alert emails, also send `adults_count` (int) and `children_ages` (list of ages 0–15). Old clients that only send `passengers` continue to work; `adults_count` is derived automatically. All price totals and alert thresholds are calculated for the full group.

`alert_price` is optional. When provided it must be a whole number (integer, no decimals) and represents the **maximum combined group total** (outbound + inbound × number of passengers).

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
        "origin_full": "Dublin Airport",
        "destination": "BCN",
        "destination_full": "Barcelona International Airport",
        "departure_time": "2025-08-01T06:00:00",
        "airline": "Ryanair",
        "airline_iata": "FR"
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

### Profile

Both endpoints require authentication.

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/profile/` | — | Return the current user's profile defaults |
| `PUT` | `/profile/` | see below | Update profile defaults |

#### Profile body

```json
{
  "default_origin": "DUB",
  "travel_adults": 2,
  "travel_children_birthdates": ["2018-05-01"],
  "theme_preference": "dark",
  "language": "nl"
}
```

All fields optional (omitted fields reset to defaults). `default_origin` must be a valid 3-letter IATA code or `null`. `travel_adults` 1–9 (default 1). `travel_children_birthdates` is a list of `YYYY-MM-DD` strings (max 8, no future dates); ages are derived from birthdates and used to determine infant/child/adult category. Total adults + children ≤ 9. `theme_preference` must be `"light"`, `"dark"`, or `"system"`. `language` must be one of `en`, `nl`, `fr`, `de`, `pl`, `it`, `es`, `pt` (default `en`).

### Admin

All endpoints require the authenticated user to have `is_admin = true`. The primary admin (email matches `ADMIN_EMAIL`) is granted `is_admin` on startup; additional admins can be granted via the panel.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users with email, join date, saved-search count, and `is_admin` flag |
| `GET` | `/admin/logs` | Last 200 scheduler check logs with route info, prices, and goal flags |
| `POST` | `/admin/run-check` | Trigger the hourly scheduler job immediately; returns `{ "routes_checked": N }` |
| `PUT` | `/admin/users/{id}/make-admin` | Grant admin to a user |
| `DELETE` | `/admin/users/{id}/make-admin` | Revoke admin from a user (primary admin is protected) |

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

The test suite uses an in-memory SQLite database for full isolation. All Google Flights API calls are mocked — no network access required.

Current coverage: **99%** across all source files.

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
│   ├── models.py            # ORM models: User, Route, RouteCheckLog, PasswordResetToken, AccountDeletionToken
│   ├── scheduler.py         # Hourly job: checks routes against alert goals, writes RouteCheckLog
│   ├── routers/
│   │   ├── admin.py         # GET /admin/users, GET /admin/logs, POST /admin/run-check
│   │   ├── auth.py          # register, login, logout, me, forgot-password, reset-password + JWT dependency
│   │   ├── flights.py       # GET /flights/search + Google Flights (fli) search logic
│   │   ├── profile.py       # GET/PUT /profile/
│   │   └── routes.py        # GET/POST/PUT/DELETE /routes/
│   ├── tests/
│   │   ├── conftest.py      # SQLite test client + fixtures
│   │   ├── test_admin.py
│   │   ├── test_auth.py
│   │   ├── test_database.py
│   │   ├── test_flights.py
│   │   ├── test_health.py
│   │   ├── test_models.py
│   │   ├── test_profile.py
│   │   ├── test_routes.py
│   │   └── test_scheduler.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Router (Login, Register, ForgotPassword, ResetPassword, Search, SavedSearches, Profile, Admin, DeleteAccount)
│   │   ├── pages/           # Login, Register, ForgotPassword, ResetPassword, Search, SavedSearches, Profile, Admin, DeleteAccount
│   │   ├── components/      # Navbar, AirportInput, DateRangePicker, FlightList, PriceSuggestions, CheapestTotal
│   │   ├── lib/             # sanitize, useDarkMode, apiError utilities
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
2. The API calls the Google Flights API (via the `fli` library) for the selected dates, fetching all non-stop results.
3. In parallel, it fetches the single cheapest price for each of the 6 surrounding dates (±3 days, both directions) to build the suggestions grid.
4. Results are sorted cheapest-first and returned to the frontend.

### Background route checker

Every hour APScheduler runs `check_routes()`, which:

1. Queries all active routes with a future departure date and at least one alert set (`alert_price` or `notify_available`).
2. For each route, fetches the cheapest outbound and inbound price from Google Flights.
3. Evaluates whether the price goal (total ≤ `alert_price`) and/or availability goal (any outbound flight exists) are met.
4. Writes a `RouteCheckLog` row recording the prices found, goal flags, and any error.
5. If a goal is met, sets `route.is_active = False` so the route is skipped on all future runs, and sends a styled HTML alert email to the user with a "Search on Google Flights" button for the route.
6. After the check loop, `expire_routes()` runs: any active route whose departure date has now passed without its goal being met is deleted from the database, and the user receives a "sorry" email explaining that no matching flight was found in time.

The saved searches page reflects the goal status: once a goal is reached the card shows a green "Goal reached · \<date\>" banner and the search is no longer checked.

---

## License

MIT
