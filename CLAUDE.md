# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

El Cheapo is a Ryanair flight price monitor. Users search for flights, save searches with price/availability alert thresholds, and receive HTML emails when goals are met. An hourly APScheduler job checks all saved routes and sends alerts.

## Commands

### Full stack
```bash
docker compose up --build          # Start everything (db, api, frontend, mailpit)
docker compose up --build api      # Rebuild and restart only the API
```

### Backend tests
```bash
# Run all tests (always rebuild first to pick up code changes)
docker compose run --rm test pytest tests/ -v --cov=. --cov-report=term-missing

# Run a single test file or test
docker compose run --rm test pytest tests/test_routes.py -v
docker compose run --rm test pytest tests/test_auth.py::test_login -v
```

### Frontend
```bash
cd frontend
npm run dev        # Dev server (proxies /api → http://api:8000)
npm run build      # TypeScript check + Vite build
npm test           # Vitest (jsdom)
```

### Services & ports
| Service | Port | Notes |
|---|---|---|
| API | 8000 | Swagger at `/docs` |
| Frontend | 5173 | Vite dev server |
| Mailpit UI | 8025 | Catches all outbound email locally |
| PostgreSQL | 5432 | |

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + React Router
- **Backend**: Python 3.12 + FastAPI + SQLAlchemy 2.0 (async ORM) + PostgreSQL 16
- **Auth**: JWT (python-jose) + bcrypt; dual transport — httpOnly cookie (browser) or Bearer token (API clients)
- **Scheduler**: APScheduler background job runs hourly
- **Flight data**: Ryanair unofficial API (ryanair-py) via ThreadPoolExecutor (10–20 concurrent workers)
- **Email**: smtplib → Mailpit locally; configurable SMTP in prod

### Auth flow
`get_current_user` dependency (in `dependencies.py`) checks Bearer token first, then httpOnly cookie. All protected routes use `Depends(get_current_user)`. Login is rate-limited (slowapi: 10/min); forgot-password is 5/min.

### Frontend → Backend
Vite proxies `/api/*` → `http://api:8000/*`, stripping the `/api` prefix. So `fetch('/api/auth/login')` hits `POST /auth/login` on the API. This means frontend code always uses `/api/...` paths.

### Flight search flow
`GET /flights/search` (in `routers/flights.py`):
1. Validates IATA codes and date range (≤90 days)
2. Fetches Ryanair timetable for scheduled flights
3. Uses `ThreadPoolExecutor` to fetch fares concurrently (10 workers for flights, 20 for suggestions)
4. In parallel fetches cheapest price for ±3-day date suggestions (7 rows total)
5. Returns sorted outbound/inbound lists + suggestion grid

### Scheduler flow
`scheduler.check_routes()` (hourly):
1. Queries all active routes with future `date_from` and at least one alert set
2. Fetches cheapest prices from Ryanair per route
3. Evaluates `price_goal_reached` (total ≤ `alert_price`) and `available_goal_reached` (`notify_available` + flights exist)
4. Writes `RouteCheckLog`; if goal reached: sets `route.is_active = False`, sends HTML alert email
5. Calls `expire_routes()`: deletes routes whose `date_from` has passed, sends expiry email

### Database models
- `users` — id (UUID), email, password_hash
- `routes` — id (UUID), user_id FK, origin, destination, date_from, date_to, alert_price, notify_available, is_active
- `route_check_logs` — per-hour check results: prices, goal flags, error
- `password_reset_tokens` — token, expires_at (1h), used flag
- `flights`, `alerts` — exist but rarely used in the main flows

### Key patterns
- **Dependency injection**: `Depends(get_db)`, `Depends(get_current_user)` used throughout routers
- **Rate limiting**: slowapi decorators on login and forgot-password endpoints; disabled in tests via fixture
- **Concurrency**: `ThreadPoolExecutor` for all Ryanair API calls — never call them sequentially
- **Security headers**: applied in middleware (CSP, X-Frame-Options, X-Content-Type-Options)
- **Test isolation**: SQLite in-memory DB via `conftest.py`; all Ryanair network calls mocked

## Testing notes

- Always `--build` before running tests after code changes — the test container doesn't hot-reload
- Backend tests mock all Ryanair API calls (no network access required)
- 99% coverage is the baseline; keep it there
- Rate limiter is disabled in tests via a fixture in `conftest.py`
- UUID primary keys behave differently in SQLite vs PostgreSQL — avoid raw SQL that assumes type

## Environment

Copy `.env.example` to `.env`. Key variables:
- `SECRET_KEY` — JWT signing key (change in production)
- `COOKIE_SECURE` — set `true` for HTTPS
- `ADMIN_EMAIL` — email address granted access to `/admin/*` endpoints
- `FRONTEND_URL` — used in password-reset email links
- SMTP settings default to Mailpit (`localhost:1025`) if not set
