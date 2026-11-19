"""Login, logout and status routes for the optional household password."""

import asyncio
import ipaddress

from fastapi import APIRouter, HTTPException, Request, Response

from cociboard.auth import (
    SECONDS_PER_DAY,
    SESSION_COOKIE,
    AuthState,
    needs_renewal,
    verify_password,
)
from cociboard.schemas import AuthStatus, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth(request: Request) -> AuthState | None:
    state: AuthState | None = request.app.state.auth
    return state


def _set_cookie(response: Response, request: Request, auth: AuthState) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        auth.issue(),
        max_age=auth.session_days * SECONDS_PER_DAY,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )


def _is_exposed(request: Request) -> bool:
    """True for a request from a public (global) address."""
    host = request.client.host if request.client else None
    try:
        return host is not None and ipaddress.ip_address(host).is_global
    except ValueError:
        return False


@router.get("/status", response_model=AuthStatus)
def status(request: Request, response: Response) -> AuthStatus:
    """Whether a password is required and whether this client is signed in."""
    auth = _auth(request)
    if auth is None:
        return AuthStatus(enabled=False, authenticated=True, exposed=_is_exposed(request))
    issued = auth.session_issued(request.cookies.get(SESSION_COOKIE))
    if issued is not None and needs_renewal(issued, auth.clock()):
        _set_cookie(response, request, auth)
    return AuthStatus(enabled=True, authenticated=issued is not None, exposed=False)


@router.post("/login", status_code=204)
async def login(body: LoginRequest, request: Request) -> Response:
    """Check the password and start a session. ``404 auth_disabled`` when no password is set."""
    auth = _auth(request)
    if auth is None:
        raise HTTPException(status_code=404, detail={"code": "auth_disabled"})
    ip = request.client.host if request.client else "unknown"
    wait = auth.limiter.acquire(ip)
    if wait is not None:
        raise HTTPException(
            status_code=429,
            detail={"code": "too_many_attempts", "retry_after": wait},
            headers={"Retry-After": str(wait)},
        )
    # scrypt takes ~100 ms of CPU: keep it off the event loop.
    if await asyncio.to_thread(verify_password, body.password, auth.password_hash):
        auth.limiter.reset(ip)
        response = Response(status_code=204)
        _set_cookie(response, request, auth)
        return response
    await asyncio.sleep(auth.failure_delay)
    raise HTTPException(status_code=401, detail={"code": "invalid_password"})


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    """End the session by deleting the cookie."""
    response = Response(status_code=204)
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return response
