import os
import secrets
import smtplib
import uuid as uuid_module
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from config import ADMIN_EMAIL
from database import get_db
from limiter import limiter
from models import AccountDeletionToken, PasswordResetToken, Route, RouteCheckLog, User

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    # Explicit Bearer token takes priority (API clients / tests that pass tokens directly).
    # Cookie used as fallback when no Authorization header is present (browser flow).
    token = credentials.credentials if credentials is not None else access_token
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == uuid_module.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
    )


def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    email: str
    is_admin: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator("token")
    @classmethod
    def validate_token(cls, v: str) -> str:
        if len(v) > 128:
            raise ValueError("Invalid token")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v


def _send_reset_email(to_email: str, reset_url: str) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        print(f"[password reset] {reset_url}", flush=True)
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", smtp_user)

    msg = EmailMessage()
    msg["Subject"] = "Reset your El Cheapo password"
    msg["From"] = from_addr
    msg["To"] = to_email

    # Plain-text fallback
    msg.set_content(
        f"Hi,\n\n"
        f"Someone requested a password reset for your El Cheapo account.\n\n"
        f"Click the link below to set a new password (valid for 1 hour):\n\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n"
        f"— El Cheapo\n"
    )

    # HTML version
    msg.add_alternative(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your El Cheapo password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background-color:#1e40af;border-radius:16px 16px 0 0;padding:36px 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2d55c8;border-radius:10px;padding:8px 10px;vertical-align:middle;">
                    <span style="font-size:20px;line-height:1;">&#9992;&#65039;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;">El Cheapo</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">
                Reset your password
              </p>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:15px;line-height:1.5;">
                We received a request to reset the password for your account.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Click the button below to choose a new password. This link is valid for <strong>1 hour</strong> and can only be used once.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="{reset_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Set new password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;">
                <a href="{reset_url}" style="color:#2563eb;font-size:13px;text-decoration:none;">{reset_url}</a>
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email — your password will not be changed.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                &#169; El Cheapo &middot; Sent to {to_email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>""", subtype="html")

    try:
        with smtplib.SMTP(host, port) as smtp:
            if smtp_user:
                smtp.starttls()
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        print(f"[password reset] Failed to send email: {exc}", flush=True)
        print(f"[password reset] Reset URL: {reset_url}", flush=True)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        is_admin=current_user.email == ADMIN_EMAIL,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=body.email, password_hash=pwd_context.hash(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=200)
def logout(response: Response):
    response.delete_cookie(key="access_token", samesite="lax", httponly=True)
    return {"message": "Logged out"}


@router.post("/forgot-password", status_code=200)
@limiter.limit("5/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        # Invalidate any existing unused tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,  # noqa: E712
        ).update({"used": True})

        token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        _send_reset_email(user.email, f"{frontend_url}/reset-password?token={token}")

    # Always return the same response — never reveal whether an email is registered
    return {"message": "If that email is registered, you'll receive a reset link shortly."}


@router.post("/reset-password", status_code=200)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == body.token,
        PasswordResetToken.used == False,  # noqa: E712
        PasswordResetToken.expires_at > now,
    ).first()

    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    user.password_hash = pwd_context.hash(body.password)
    reset_token.used = True
    db.commit()

    return {"message": "Password updated successfully"}


def _send_delete_confirmation_email(to_email: str, confirm_url: str) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        print(f"[account deletion] {confirm_url}", flush=True)
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", smtp_user)

    msg = EmailMessage()
    msg["Subject"] = "Confirm your El Cheapo account deletion"
    msg["From"] = from_addr
    msg["To"] = to_email

    msg.set_content(
        f"Hi,\n\n"
        f"We received a request to permanently delete your El Cheapo account and all associated data.\n\n"
        f"Click the link below to confirm (valid for 1 hour):\n\n"
        f"{confirm_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — your account will not be deleted.\n\n"
        f"— El Cheapo\n"
    )

    msg.add_alternative(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirm account deletion</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background-color:#991b1b;border-radius:16px 16px 0 0;padding:36px 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#7f1d1d;border-radius:10px;padding:8px 10px;vertical-align:middle;">
                    <span style="font-size:20px;line-height:1;">&#9992;&#65039;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;">El Cheapo</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">
                Confirm account deletion
              </p>
              <p style="margin:8px 0 0;color:#fecaca;font-size:15px;line-height:1.5;">
                This action is permanent and cannot be undone.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                We received a request to permanently delete your El Cheapo account (<strong>{to_email}</strong>) and all associated data, including your saved searches and alert history.
              </p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Click the button below to confirm. This link is valid for <strong>1 hour</strong> and can only be used once.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#dc2626;border-radius:10px;">
                    <a href="{confirm_url}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Delete my account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;">
                <a href="{confirm_url}" style="color:#dc2626;font-size:13px;text-decoration:none;">{confirm_url}</a>
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                If you didn't request account deletion, you can safely ignore this email — your account will remain active.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-radius:0 0 16px 16px;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                &#169; El Cheapo &middot; Sent to {to_email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>""", subtype="html")

    try:
        with smtplib.SMTP(host, port) as smtp:
            if smtp_user:
                smtp.starttls()
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        print(f"[account deletion] Failed to send email: {exc}", flush=True)
        print(f"[account deletion] Confirm URL: {confirm_url}", flush=True)


@router.post("/request-delete-account", status_code=200)
def request_delete_account(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Invalidate any existing unused deletion tokens for this user
    db.query(AccountDeletionToken).filter(
        AccountDeletionToken.user_id == current_user.id,
        AccountDeletionToken.used == False,  # noqa: E712
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    db.add(AccountDeletionToken(
        user_id=current_user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    ))
    db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    _send_delete_confirmation_email(current_user.email, f"{frontend_url}/delete-account?token={token}")

    return {"message": "A confirmation link has been sent to your email address."}


@router.delete("/delete-account", status_code=200)
def delete_account(token: str, response: Response, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    deletion_token = db.query(AccountDeletionToken).filter(
        AccountDeletionToken.token == token,
        AccountDeletionToken.used == False,  # noqa: E712
        AccountDeletionToken.expires_at > now,
    ).first()

    if not deletion_token:
        raise HTTPException(status_code=400, detail="Invalid or expired deletion link")

    user = db.query(User).filter(User.id == deletion_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired deletion link")

    # Cascade: route_check_logs → routes → tokens → user
    route_ids = [r.id for r in db.query(Route.id).filter(Route.user_id == user.id).all()]
    if route_ids:
        db.query(RouteCheckLog).filter(RouteCheckLog.route_id.in_(route_ids)).delete(synchronize_session=False)
    db.query(Route).filter(Route.user_id == user.id).delete()
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()
    db.query(AccountDeletionToken).filter(AccountDeletionToken.user_id == user.id).delete()
    db.delete(user)
    db.commit()

    response.delete_cookie(key="access_token", samesite="lax", httponly=True)
    return {"message": "Your account has been permanently deleted."}
