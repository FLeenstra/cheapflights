# El Cheapo ✈️

A Ryanair flight price monitor that helps budget travellers find the best deals. Search any route and date range to get real-time pricing, with automatic suggestions for the cheapest ±3-day window around your chosen dates.

---

## Features

- **Flight search** — real-time prices pulled from Ryanair's API for any origin/destination pair
- **Price suggestions** — cheapest outbound + inbound prices for 7 date combinations (−3 to +3 days)
- **Airport autocomplete** — fast local search across all IATA codes
- **User accounts** — register, log in, receive a JWT, and (soon) set price alerts
- **Price alerts** — schema in place; alert when a route drops below your threshold
- **Fully containerised** — one `docker compose up` gets you a running stack

---

## Tech stack

| Layer | Technology |
|---|---|
| **API** | Python 3.12, FastAPI, SQLAlchemy 2.0, psycopg2 |
| **Auth** | JWT (python-jose), bcrypt (passlib) |
| **Scheduling** | APScheduler |
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

Open `.env` and set a strong `SECRET_KEY`. The default Postgres credentials are fine for local use.

```env
POSTGRES_USER=cheapflights
POSTGRES_PASSWORD=changeme
POSTGRES_DB=cheapflights
SECRET_KEY=your-very-secret-key-here
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
| PostgreSQL | localhost:5432 |

The API creates all database tables and a default admin account on first startup.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `POSTGRES_DB` | Yes | — | PostgreSQL database name |
| `SECRET_KEY` | Yes | `change-me-in-production` | JWT signing key — **change this** |
| `DATABASE_URL` | No | derived from the above | Full SQLAlchemy connection string (set automatically by Docker Compose) |

---

## API endpoints

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/auth/register` | `{ "email": "...", "password": "..." }` | Register a new user, returns JWT |
| `POST` | `/auth/login` | `{ "email": "...", "password": "..." }` | Log in, returns JWT |

### Flights

| Method | Path | Query params | Description |
|---|---|---|---|
| `GET` | `/flights/search` | `origin`, `destination`, `date_from`, `date_to` | Search flights for a route and date range |

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

Current coverage: **99%** across all source files (minimum per file: 92%).

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
│   ├── main.py              # FastAPI app, CORS, startup event
│   ├── database.py          # SQLAlchemy engine + session + get_db
│   ├── models.py            # ORM models: User, Route, Flight, Alert
│   ├── routers/
│   │   ├── auth.py          # POST /auth/register, POST /auth/login
│   │   └── flights.py       # GET /flights/search + Ryanair API logic
│   ├── tests/
│   │   ├── conftest.py      # SQLite test client + fixtures
│   │   ├── test_auth.py
│   │   ├── test_database.py
│   │   ├── test_flights.py
│   │   ├── test_health.py
│   │   └── test_models.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Router (Login, Register, Search)
│   │   ├── pages/           # Login.tsx, Register.tsx, Search.tsx
│   │   ├── components/      # AirportInput, DateRangePicker, FlightList, PriceSuggestions
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

---

## Roadmap

- [ ] Price alert emails when a monitored route drops below a threshold
- [ ] Saved routes per user account
- [ ] Return-trip total in the main results view
- [ ] Support for multi-month searches
- [ ] Other airlines beyond Ryanair

---

## License

MIT
