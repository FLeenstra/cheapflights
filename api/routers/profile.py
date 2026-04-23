import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models import User
from routers.auth import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])

_IATA_RE = re.compile(r"^[A-Z]{3}$")
_VALID_THEMES = {"light", "dark", "system"}
_VALID_LANGUAGES = {"en", "nl", "fr", "de", "pl", "it", "es", "pt"}


class ProfileUpdate(BaseModel):
    default_origin: str | None = None
    travel_adults: int = 1
    travel_children_birthdates: list[str] = []
    theme_preference: str = "system"
    language: str = "en"

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

    @field_validator("travel_children_birthdates")
    @classmethod
    def validate_birthdates(cls, v):
        if len(v) > 8:
            raise ValueError("Cannot register more than 8 children")
        for d in v:
            try:
                datetime.strptime(d, "%Y-%m-%d")
            except ValueError:
                raise ValueError(f"Invalid date '{d}'. Use YYYY-MM-DD")
            if d > datetime.today().strftime("%Y-%m-%d"):
                raise ValueError(f"Birthdate '{d}' cannot be in the future")
        return v

    @field_validator("theme_preference")
    @classmethod
    def validate_theme(cls, v):
        if v not in _VALID_THEMES:
            raise ValueError("theme must be light, dark, or system")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v):
        if v not in _VALID_LANGUAGES:
            raise ValueError(f"language must be one of: {', '.join(sorted(_VALID_LANGUAGES))}")
        return v


def _parse_birthdates(user: User) -> list[str]:
    try:
        return json.loads(user.travel_children_birthdates or "[]")
    except (json.JSONDecodeError, TypeError):
        return []


def _profile_dict(user: User) -> dict:
    return {
        "default_origin": user.default_origin,
        "travel_adults": user.travel_adults,
        "travel_children_birthdates": _parse_birthdates(user),
        "theme_preference": user.theme_preference,
        "language": user.language,
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
    if data.travel_adults + len(data.travel_children_birthdates) > 9:
        raise HTTPException(status_code=422, detail="Total passengers (adults + children) cannot exceed 9")

    current_user.default_origin = data.default_origin
    current_user.travel_adults = data.travel_adults
    current_user.travel_children_birthdates = json.dumps(data.travel_children_birthdates)
    current_user.theme_preference = data.theme_preference
    current_user.language = data.language
    db.commit()
    return _profile_dict(current_user)
