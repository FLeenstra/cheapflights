import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models import User
from routers.auth import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])

_IATA_RE = re.compile(r"^[A-Z]{3}$")
_VALID_THEMES = {"light", "dark", "system"}


class ProfileUpdate(BaseModel):
    default_origin: str | None = None
    travel_adults: int = 1
    travel_children: int = 0
    theme_preference: str = "system"

    @field_validator("default_origin")
    @classmethod
    def validate_origin(cls, v):
        if v is not None:
            v = v.strip().upper()
            if not _IATA_RE.match(v):
                raise ValueError("origin must be a 3-letter IATA code")
        return v

    @field_validator("travel_adults")
    @classmethod
    def validate_adults(cls, v):
        if not 1 <= v <= 9:
            raise ValueError("adults must be between 1 and 9")
        return v

    @field_validator("travel_children")
    @classmethod
    def validate_children(cls, v):
        if not 0 <= v <= 9:
            raise ValueError("children must be between 0 and 9")
        return v

    @field_validator("theme_preference")
    @classmethod
    def validate_theme(cls, v):
        if v not in _VALID_THEMES:
            raise ValueError("theme must be light, dark, or system")
        return v


def _profile_dict(user: User) -> dict:
    return {
        "default_origin": user.default_origin,
        "travel_adults": user.travel_adults,
        "travel_children": user.travel_children,
        "theme_preference": user.theme_preference,
    }


@router.get("/")
def get_profile(current_user: User = Depends(get_current_user)):
    return _profile_dict(current_user)


@router.put("/")
def update_profile(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = data.travel_adults + data.travel_children
    if total > 9:
        raise HTTPException(status_code=422, detail="Total passengers (adults + children) cannot exceed 9")

    current_user.default_origin = data.default_origin
    current_user.travel_adults = data.travel_adults
    current_user.travel_children = data.travel_children
    current_user.theme_preference = data.theme_preference
    db.commit()
    return _profile_dict(current_user)
