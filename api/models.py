import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Numeric, DateTime, Date, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class AccountDeletionToken(Base):
    __tablename__ = "account_deletion_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    default_origin: Mapped[str | None] = mapped_column(String(3), nullable=True)
    travel_adults: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    travel_children_birthdates: Mapped[str] = mapped_column(String, nullable=False, default="[]", server_default="'[]'")
    theme_preference: Mapped[str] = mapped_column(String(10), nullable=False, default="system", server_default="system")

    routes: Mapped[list["Route"]] = relationship("Route", back_populates="user")


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    passengers: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    adults_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    children_ages: Mapped[str] = mapped_column(String, nullable=False, default="[]", server_default="'[]'")
    alert_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notify_available: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User | None"] = relationship("User", back_populates="routes")
    check_logs: Mapped[list["RouteCheckLog"]] = relationship("RouteCheckLog", back_populates="route")


class RouteCheckLog(Base):
    """One record per scheduled check of a saved route."""
    __tablename__ = "route_check_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("routes.id"), nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    outbound_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    inbound_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    flights_found: Mapped[bool] = mapped_column(Boolean, default=False)
    price_goal_reached: Mapped[bool] = mapped_column(Boolean, default=False)
    available_goal_reached: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(String, nullable=True)

    route: Mapped["Route"] = relationship("Route", back_populates="check_logs")
