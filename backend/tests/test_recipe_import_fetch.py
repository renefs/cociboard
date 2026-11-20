import asyncio
import gzip
import logging
import socket
from collections.abc import Callable

import httpx
import pytest

from cociboard.recipe_import.errors import ImportFailure
from cociboard.recipe_import.fetch import (
    MAX_BYTES,
    OVERALL_TIMEOUT,
    FetchedPage,
    ImportLimiter,
    decode_body,
    fetch_page,
    pinned_url,
    system_resolver,
)
from cociboard.recipe_import.validate import parse_address, parse_import_url

pytestmark = pytest.mark.anyio

Handler = Callable[[httpx.Request], httpx.Response]

HTML = {"content-type": "text/html; charset=utf-8"}
PUBLIC_IP = "93.184.216.34"


class Resolver:
    """Fake DNS: a table of host -> addresses; records every lookup."""

    def __init__(self, table: dict[str, list[str]] | None = None) -> None:
        self.table = table or {}
        self.calls: list[tuple[str, int]] = []

    async def __call__(self, host: str, port: int) -> list[str]:
        self.calls.append((host, port))
        return self.table.get(host, [PUBLIC_IP])


async def fetch(
    handler: Handler,
    url: str = "https://example.com/r",
    *,
    resolver: Resolver | None = None,
    deadline: float = OVERALL_TIMEOUT,
    max_bytes: int = MAX_BYTES,
) -> FetchedPage:
    return await fetch_page(
        url,
        resolver=resolver or Resolver(),
        transport=httpx.MockTransport(handler),
        deadline=deadline,
        max_bytes=max_bytes,
    )


async def failure(
    handler: Handler, url: str = "https://example.com/r", **kw: object
) -> ImportFailure:
    with pytest.raises(ImportFailure) as exc:
        await fetch(handler, url, **kw)  # type: ignore[arg-type]  # forwards optional keywords
    return exc.value


async def test_connection_is_pinned_to_the_vetted_address() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, headers=HTML, text="<p>hi</p>")

    page = await fetch(handler, "https://Example.com/a/b?x=1")
    assert page.url == "https://example.com/a/b?x=1"
    (request,) = seen
    assert request.url.host == PUBLIC_IP
    assert request.url.port in (None, 443)  # httpx drops a default port
    assert request.url.path == "/a/b"
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"
    assert request.headers["user-agent"].startswith("Cociboard recipe import")
    assert request.headers["accept"] == "text/html,application/xhtml+xml"
    assert "cookie" not in request.headers
    assert "authorization" not in request.headers


async def test_http_request_has_no_sni_and_ipv6_is_bracketed() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, headers=HTML, text="x")

    resolver = Resolver({"example.com": ["2606:4700:4700::1111"]})
    await fetch(handler, "http://example.com/", resolver=resolver)
    assert seen[0].url.host == "2606:4700:4700::1111"
    assert "sni_hostname" not in seen[0].extensions
    ip = parse_address("2606:4700:4700::1111")
    assert ip is not None
    target = parse_import_url("https://example.com/p")
    assert pinned_url(target, ip) == "https://[2606:4700:4700::1111]:443/p"


async def test_ip_literal_is_vetted_without_dns() -> None:
    resolver = Resolver()
    exc = await failure(lambda r: httpx.Response(200), "http://127.0.0.1/", resolver=resolver)
    assert exc.code == "blocked_address"
    assert resolver.calls == []


async def test_any_private_address_blocks_before_connecting() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, headers=HTML)

    resolver = Resolver({"example.com": [PUBLIC_IP, "10.0.0.7"]})
    exc = await failure(handler, resolver=resolver)
    assert exc.code == "blocked_address"
    assert not called


async def test_redirect_is_followed_and_revalidated() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/r":
            return httpx.Response(301, headers={"location": "/moved?x=1"})
        return httpx.Response(200, headers=HTML, text="ok")

    resolver = Resolver()
    page = await fetch(handler, resolver=resolver)
    assert page.url == "https://example.com/moved?x=1"
    assert [c[0] for c in resolver.calls] == ["example.com", "example.com"]


async def test_redirect_to_another_host_resolves_it_again() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.headers["host"] == "example.com":
            return httpx.Response(302, headers={"location": "https://recipes.example.org/r"})
        return httpx.Response(200, headers=HTML, text="ok")

    resolver = Resolver()
    page = await fetch(handler, resolver=resolver)
    assert page.url == "https://recipes.example.org/r"
    assert resolver.calls[-1] == ("recipes.example.org", 443)


@pytest.mark.parametrize(
    "location",
    [
        "http://127.0.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://localhost-alias.example/",  # resolves to loopback below
        "http://2130706433/",
    ],
)
async def test_redirect_to_internal_address_is_blocked(location: str) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": location})

    resolver = Resolver({"localhost-alias.example": ["127.0.0.1"]})
    exc = await failure(handler, resolver=resolver)
    assert exc.code == "blocked_address"
    assert len(requests) == 1  # the internal hop was never requested


@pytest.mark.parametrize("location", ["ftp://example.com/", "https://example.com:8443/", "//"])
async def test_redirect_with_bad_scheme_or_port_fails(location: str) -> None:
    exc = await failure(lambda r: httpx.Response(302, headers={"location": location}))
    assert exc.code == "fetch_failed"


async def test_too_many_redirects() -> None:
    count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        return httpx.Response(302, headers={"location": f"/hop{count}"})

    exc = await failure(handler)
    assert exc.code == "fetch_failed"
    assert count == 6  # the original request plus five redirects


async def test_exactly_five_redirects_are_followed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        n = int(request.url.path.removeprefix("/hop") or 0) if request.url.path != "/r" else 0
        if n < 5:
            return httpx.Response(302, headers={"location": f"/hop{n + 1}"})
        return httpx.Response(200, headers=HTML, text="done")

    page = await fetch(handler)
    assert page.url.endswith("/hop5")


async def test_redirect_without_location() -> None:
    exc = await failure(lambda r: httpx.Response(302))
    assert (exc.code, exc.status) == ("fetch_failed", 302)


@pytest.mark.parametrize("status", [403, 404, 500, 503])
async def test_non_success_status(status: int) -> None:
    exc = await failure(lambda r: httpx.Response(status, headers=HTML, text="nope"))
    assert (exc.code, exc.status) == ("fetch_failed", status)


async def test_network_errors() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    def reset(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadError("reset")

    assert (await failure(refuse)).code == "fetch_failed"
    assert (await failure(reset)).code == "fetch_failed"


async def test_next_address_is_tried_after_a_refused_connection() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        if request.url.host == "8.8.4.4":
            raise httpx.ConnectError("refused")
        return httpx.Response(200, headers=HTML, text="ok")

    resolver = Resolver({"example.com": ["8.8.4.4", "8.8.8.8"]})
    await fetch(handler, resolver=resolver)
    assert seen == ["8.8.4.4", "8.8.8.8"]


async def test_unresolvable_host() -> None:
    class NoDns(Resolver):
        async def __call__(self, host: str, port: int) -> list[str]:
            raise ImportFailure("fetch_failed")

    exc = await failure(lambda r: httpx.Response(200), resolver=NoDns())
    assert exc.code == "fetch_failed"


async def test_httpx_timeout_is_a_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    assert (await failure(handler)).code == "timeout"


async def test_overall_deadline() -> None:
    class SlowDns(Resolver):
        async def __call__(self, host: str, port: int) -> list[str]:
            await asyncio.sleep(5)
            return [PUBLIC_IP]

    exc = await failure(lambda r: httpx.Response(200), resolver=SlowDns(), deadline=0.05)
    assert exc.code == "timeout"


async def test_body_over_the_cap_is_refused() -> None:
    big = "x" * 5000
    exc = await failure(lambda r: httpx.Response(200, headers=HTML, text=big), max_bytes=1000)
    assert exc.code == "too_large"


async def test_declared_content_length_over_the_cap_is_refused_early() -> None:
    headers = {**HTML, "content-length": "999999999"}
    exc = await failure(lambda r: httpx.Response(200, headers=headers, content=b"x"))
    assert exc.code == "too_large"


async def test_decompressed_size_is_capped() -> None:
    body = gzip.compress(b"a" * 100_000)
    headers = {**HTML, "content-encoding": "gzip"}
    exc = await failure(
        lambda r: httpx.Response(200, headers=headers, content=body), max_bytes=5000
    )
    assert exc.code == "too_large"


@pytest.mark.parametrize(
    "content_type", ["application/pdf", "image/png", "text/plain", "application/json", ""]
)
async def test_content_type_must_be_html(content_type: str) -> None:
    headers = {"content-type": content_type} if content_type else {}
    exc = await failure(lambda r: httpx.Response(200, headers=headers, content=b"%PDF"))
    assert exc.code == "not_html"


@pytest.mark.parametrize(
    "content_type", ["TEXT/HTML", "application/xhtml+xml", "application/ld+json"]
)
async def test_accepted_content_types(content_type: str) -> None:
    page = await fetch(
        lambda r: httpx.Response(200, headers={"content-type": content_type}, text="ok")
    )
    assert page.html == "ok"


def test_decode_body_charsets() -> None:
    latin = "Crème brûlée".encode("latin-1")
    assert decode_body(latin, "text/html; charset=ISO-8859-1") == "Crème brûlée"
    assert decode_body("Crème".encode(), "text/html") == "Crème"
    assert decode_body(b"caf\xe9", "text/html") == "caf�"
    assert decode_body(b"ok", "text/html; charset=nonsense") == "ok"


async def test_outcome_is_logged_with_host_only(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="cociboard.recipe_import"):
        await fetch(
            lambda r: httpx.Response(200, headers=HTML, text="ok"),
            "https://example.com/secret?token=1",
        )
    assert "example.com" in caplog.text
    assert "token" not in caplog.text and "secret" not in caplog.text


async def test_system_resolver_dedupes_and_reports_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(host: str, port: int, family: int, type_: int) -> list[tuple[object, ...]]:
        return [(0, 0, 0, "", ("8.8.8.8", port)), (0, 0, 0, "", ("8.8.8.8", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake)
    assert await system_resolver("example.com", 443) == ["8.8.8.8"]

    def boom(*args: object) -> list[object]:
        raise socket.gaierror("nope")

    monkeypatch.setattr(socket, "getaddrinfo", boom)
    with pytest.raises(ImportFailure):
        await system_resolver("example.com", 443)


async def test_limiter_allows_two_and_then_answers_busy() -> None:
    limiter = ImportLimiter(limit=2, wait=0.05)
    async with limiter.slot(), limiter.slot():
        with pytest.raises(ImportFailure) as exc:
            async with limiter.slot():
                pass
        assert exc.value.code == "busy"
    async with limiter.slot():  # a slot is free again
        pass
