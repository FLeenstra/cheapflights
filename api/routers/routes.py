from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Route, User
from routers.auth import get_current_user

router = APIRouter(prefix="/routes", tags=["routes"])


class SaveRouteRequest(BaseModel):
    origin: str
    destination: str
    date_from: date
    date_to: date
    alert_price: int | None = None  # whole euros only; None means no alert


@router.post("/", status_code=201)
def save_route(
    body: SaveRouteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.date_from > body.date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    route = Route(
        user_id=current_user.id,
        origin=body.origin.upper(),
        destination=body.destination.upper(),
        date_from=body.date_from,
        date_to=body.date_to,
        alert_price=Decimal(body.alert_price) if body.alert_price is not None else None,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return {"id": str(route.id)}
