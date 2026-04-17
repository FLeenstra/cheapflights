from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from config import ADMIN_EMAIL
from database import Base, SessionLocal, engine
from limiter import limiter
from models import User
from routers import admin, auth, flights, profile, routes

app = FastAPI(title="El Cheapo API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'none'"
    return response

app.include_router(auth.router)
app.include_router(flights.router)
app.include_router(routes.router)
app.include_router(profile.router)
app.include_router(admin.router)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_PASSWORD = "Admin1234!"


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS "
            "notify_available BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        conn.execute(text(
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS "
            "passengers INTEGER NOT NULL DEFAULT 1"
        ))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS default_origin VARCHAR(3)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_adults INTEGER NOT NULL DEFAULT 1"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_children INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_children_birthdates TEXT NOT NULL DEFAULT '[]'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'system'"))
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == ADMIN_EMAIL).first():
            db.add(User(email=ADMIN_EMAIL, password_hash=pwd_context.hash(ADMIN_PASSWORD)))
            db.commit()
    finally:
        db.close()

    from scheduler import check_routes
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(check_routes, "interval", hours=1)
    _scheduler.start()


@app.get("/health")
def health():
    return {"status": "ok"}
