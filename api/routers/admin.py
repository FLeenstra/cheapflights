import uuid as uuid_module
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import ADMIN_EMAIL
from database import get_db
from models import Route, RouteCheckLog, User
from routers.auth import get_current_user
from scheduler import check_routes

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime
    route_count: int
    is_admin: bool


class LogOut(BaseModel):
    id: str
    route_id: str
    origin: str
    destination: str
    date_from: str
    date_to: str
    checked_at: datetime
    outbound_price: Optional[float]
    inbound_price: Optional[float]
    total_price: Optional[float]
    flights_found: bool
    price_goal_reached: bool
    available_goal_reached: bool
    error: Optional[str]


class RunCheckResponse(BaseModel):
    message: str
    routes_checked: int


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    counts = {
        row.user_id: row.count
        for row in db.query(
            Route.user_id, func.count(Route.id).label("count")
        ).group_by(Route.user_id).all()
    }
    return [
        UserOut(
            id=str(u.id),
            email=u.email,
            created_at=u.created_at,
            route_count=counts.get(u.id, 0),
            is_admin=u.is_admin,
        )
        for u in users
    ]


@router.get("/logs", response_model=list[LogOut])
def list_logs(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin),
):
    logs = (
        db.query(RouteCheckLog)
        .order_by(RouteCheckLog.checked_at.desc())
        .limit(200)
        .all()
    )
    route_map = {
        r.id: r
        for r in db.query(Route)
        .filter(Route.id.in_({log.route_id for log in logs}))
        .all()
    } if logs else {}

    result = []
    for log in logs:
        r = route_map.get(log.route_id)
        result.append(LogOut(
            id=str(log.id),
            route_id=str(log.route_id),
            origin=r.origin if r else "?",
            destination=r.destination if r else "?",
            date_from=r.date_from.isoformat() if r else "?",
            date_to=r.date_to.isoformat() if r else "?",
            checked_at=log.checked_at,
            outbound_price=float(log.outbound_price) if log.outbound_price is not None else None,
            inbound_price=float(log.inbound_price) if log.inbound_price is not None else None,
            total_price=float(log.total_price) if log.total_price is not None else None,
            flights_found=log.flights_found,
            price_goal_reached=log.price_goal_reached,
            available_goal_reached=log.available_goal_reached,
            error=log.error,
        ))
    return result


@router.post("/run-check", response_model=RunCheckResponse)
def run_check(_: User = Depends(get_admin)):
    count = check_routes()
    return RunCheckResponse(message="Check complete", routes_checked=count)


@router.put("/users/{user_id}/make-admin")
def make_admin(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin),
):
    try:
        uid = uuid_module.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"message": f"{user.email} is now an admin"}


@router.delete("/users/{user_id}/make-admin")
def revoke_admin(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin),
):
    try:
        uid = uuid_module.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.email == ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Cannot revoke admin from the primary admin account")
    admin_count = db.query(func.count(User.id)).filter(User.is_admin == True).scalar()  # noqa: E712
    if admin_count <= 1:
        raise HTTPException(status_code=403, detail="Cannot revoke the last admin account")
    user.is_admin = False
    db.commit()
    return {"message": f"{user.email} is no longer an admin"}
