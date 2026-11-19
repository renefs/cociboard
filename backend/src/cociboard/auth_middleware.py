"""ASGI middleware enforcing the household password and a CSRF origin check on ``/api``."""

from urllib.parse import urlsplit

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from cociboard.auth import SESSION_COOKIE, AuthState

PUBLIC_PATHS = frozenset({"/api/health", "/api/auth/status", "/api/auth/login", "/api/auth/logout"})
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def origin_allowed(request: Request, allowed_origins: list[str]) -> bool:
    """True when ``Origin`` is absent, the request's own origin or a configured CORS origin.

    The own origin is matched by host (``Host`` or ``X-Forwarded-Host``). A proxy that
    terminates TLS without ``X-Forwarded-Proto`` makes the request look like http, so an
    https origin on the same host is accepted too.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return True
    if origin in allowed_origins:
        return True
    parts = urlsplit(origin)
    hosts = {request.headers.get("host"), request.headers.get("x-forwarded-host")}
    if not parts.netloc or parts.netloc not in hosts:
        return False
    return parts.scheme == request.url.scheme or parts.scheme == "https"


class AuthMiddleware:
    """Require a valid session for every ``/api`` route except the public ones."""

    def __init__(self, app: ASGIApp, auth: AuthState, cors_origins: list[str]) -> None:
        self.app = app
        self.auth = auth
        self.cors_origins = cors_origins

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not (path == "/api" or path.startswith("/api/")):
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if request.method in UNSAFE_METHODS and not origin_allowed(request, self.cors_origins):
            await self._reject(403, "bad_origin", scope, receive, send)
            return
        if path not in PUBLIC_PATHS:
            token = request.cookies.get(SESSION_COOKIE)
            if self.auth.session_issued(token) is None:
                await self._reject(401, "auth_required", scope, receive, send)
                return
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(status: int, code: str, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse({"detail": {"code": code}}, status_code=status)
        await response(scope, receive, send)
