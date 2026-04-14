import re
import uuid as uuid_module
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models import Route, User
from routers.auth import get_current_user

router = APIRouter(prefix="/routes", tags=["routes"])


_IATA_RE = re.compile(r"^[A-Z]{3}$")


class SaveRouteRequest(BaseModel):
    origin: str
    destination: str
    date_from: date
    date_to: date
    alert_price: int | None = None  # whole euros only; None means no alert

    @field_validator("origin", "destination")
    @classmethod
    def validate_iata(cls, v: str) -> str:
        normalized = v.strip().upper()
        if not _IATA_RE.match(normalized):
            raise ValueError("Must be a 3-letter IATA airport code")
        return normalized

    @field_validator("alert_price")
    @classmethod
    def validate_alert_price(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("alert_price must be a positive integer")
        return v


class RouteOut(BaseModel):
    id: str
    origin: str
    destination: str
    date_from: date
    date_to: date
    alert_price: int | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[RouteOut])
def list_routes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routes = (
        db.query(Route)
        .filter(Route.user_id == current_user.id)
        .order_by(Route.created_at.desc())
        .all()
    )
    return [
        RouteOut(
            id=str(r.id),
            origin=r.origin,
            destination=r.destination,
            date_from=r.date_from,
            date_to=r.date_to,
            alert_price=int(r.alert_price) if r.alert_price is not None else None,
            is_active=r.is_active,
            created_at=r.created_at,
        )
        for r in routes
    ]


@router.post("/", status_code=201)
def save_route(
    body: SaveRouteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.date_from > body.date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    duplicate = db.query(Route).filter(
        Route.user_id == current_user.id,
        Route.origin == body.origin,
        Route.destination == body.destination,
        Route.date_from == body.date_from,
        Route.date_to == body.date_to,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="You already have a saved search for this route and dates.",
        )

    route = Route(
        user_id=current_user.id,
        origin=body.origin,
        destination=body.destination,
        date_from=body.date_from,
        date_to=body.date_to,
        alert_price=Decimal(body.alert_price) if body.alert_price is not None else None,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return {"id": str(route.id)}


@router.delete("/{route_id}", status_code=204)
def delete_route(
    route_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        rid = uuid_module.UUID(route_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Route not found")

    route = db.query(Route).filter(
        Route.id == rid,
        Route.user_id == current_user.id,
    ).first()

    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    db.delete(route)
    db.commit()
    return Response(status_code=204)
