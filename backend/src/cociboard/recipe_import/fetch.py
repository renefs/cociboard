"""Guarded fetching of a recipe page.

The server fetches a URL the user supplies, so every hop is validated (``validate``), the
host is resolved here, and the connection is pinned to the vetted address: the request goes
to the IP, with the original host in ``Host`` and in the TLS SNI, so a DNS answer that
changes between the check and the connection (rebinding) cannot redirect it.
"""

import asyncio
import codecs
import logging
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from cociboard.recipe_import.errors import ImportFailure
from cociboard.recipe_import.validate import (
    ImportTarget,
    IPAddress,
    parse_address,
    parse_import_url,
    vet_addresses,
)

logger = logging.getLogger("cociboard.recipe_import")

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 5
OVERALL_TIMEOUT = 15.0
TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
MAX_ADDRESSES_TRIED = 3
MAX_CONCURRENT = 2
QUEUE_WAIT = 2.0  # seconds a request waits for a free slot before answering 429 ``busy``
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
HTML_TYPES = frozenset({"text/html", "application/xhtml+xml", "application/ld+json"})
REQUEST_HEADERS = {
    "User-Agent": "Cociboard recipe import (+https://github.com/renefs/cociboard)",
    "Accept": "text/html,application/xhtml+xml",
}

Resolver = Callable[[str, int], Awaitable[list[str]]]


@dataclass(frozen=True)
class FetchedPage:
    """A downloaded page: the URL after redirects and its decoded text."""

    url: str
    html: str


PageFetcher = Callable[[str], Awaitable[FetchedPage]]


async def system_resolver(host: str, port: int) -> list[str]:
    """Resolve ``host`` with the system resolver, in a thread (``getaddrinfo`` blocks)."""
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, port, 0, socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        raise ImportFailure("fetch_failed") from None
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


def decode_body(data: bytes, content_type: str) -> str:
    """Decode with the declared charset; utf-8 with replacement when absent or unknown."""
    charset = "utf-8"
    for param in content_type.split(";")[1:]:
        name, _, value = param.partition("=")
        if name.strip().lower() == "charset":
            try:
                charset = codecs.lookup(value.strip().strip("\"'")).name
            except LookupError:
                charset = "utf-8"
    return data.decode(charset, errors="replace")


def pinned_url(target: ImportTarget, ip: IPAddress) -> str:
    """The URL to request: the vetted IP (IPv6 bracketed) in place of the host name."""
    host = f"[{ip}]" if ip.version == 6 else str(ip)
    return f"{target.scheme}://{host}:{target.port}{target.path}"


@dataclass(frozen=True)
class _Redirect:
    location: str


@dataclass(frozen=True)
class _Body:
    text: str


async def _read(response: httpx.Response, max_bytes: int) -> _Redirect | _Body:
    status = response.status_code
    if status in REDIRECT_STATUSES:
        location = response.headers.get("location")
        if not location:
            raise ImportFailure("fetch_failed", status)
        return _Redirect(location)
    if not 200 <= status < 300:
        raise ImportFailure("fetch_failed", status)
    content_type = response.headers.get("content-type", "")
    if content_type.split(";")[0].strip().lower() not in HTML_TYPES:
        raise ImportFailure("not_html")
    declared = response.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        raise ImportFailure("too_large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > max_bytes:
            raise ImportFailure("too_large")
        chunks.append(chunk)
    return _Body(decode_body(b"".join(chunks), content_type))


async def _get_pinned(
    client: httpx.AsyncClient, target: ImportTarget, addresses: list[IPAddress], max_bytes: int
) -> _Redirect | _Body:
    """GET ``target`` through the first vetted address that accepts a connection."""
    extensions: dict[str, object] = (
        {"sni_hostname": target.host} if target.scheme == "https" else {}
    )
    for ip in addresses[:MAX_ADDRESSES_TRIED]:
        try:
            async with client.stream(
                "GET",
                pinned_url(target, ip),
                headers={"Host": target.host_header},
                extensions=extensions,
            ) as response:
                return await _read(response, max_bytes)
        except httpx.ConnectError:
            continue
        except httpx.TimeoutException:
            raise ImportFailure("timeout") from None
        except (httpx.HTTPError, httpx.InvalidURL, httpx.StreamError):
            raise ImportFailure("fetch_failed") from None
    raise ImportFailure("fetch_failed")


async def _fetch(
    url: str, resolver: Resolver, transport: httpx.AsyncBaseTransport | None, max_bytes: int
) -> FetchedPage:
    async with httpx.AsyncClient(
        transport=transport,
        timeout=TIMEOUT,
        follow_redirects=False,
        trust_env=False,  # no proxies from the environment
        headers=REQUEST_HEADERS,  # never the user's cookies or credentials
        verify=True,
    ) as client:
        target = parse_import_url(url)
        for hop in range(MAX_REDIRECTS + 1):
            literal = parse_address(target.host)
            resolved = [str(literal)] if literal else await resolver(target.host, target.port)
            addresses = vet_addresses(resolved)
            result = await _get_pinned(client, target, addresses, max_bytes)
            if isinstance(result, _Body):
                return FetchedPage(target.url, result.text)
            if hop == MAX_REDIRECTS:
                break
            try:
                target = parse_import_url(urljoin(target.url, result.location))
            except ImportFailure as exc:
                # A bad redirect is the site's fault, not a bad link from the user.
                raise (
                    exc if exc.code == "blocked_address" else ImportFailure("fetch_failed")
                ) from None
    raise ImportFailure("fetch_failed")  # too many redirects


async def fetch_page(
    url: str,
    *,
    resolver: Resolver = system_resolver,
    transport: httpx.AsyncBaseTransport | None = None,
    deadline: float = OVERALL_TIMEOUT,
    max_bytes: int = MAX_BYTES,
) -> FetchedPage:
    """Download the page at ``url`` safely. Raises ``ImportFailure`` with a code."""
    host = "?"
    with suppress(ImportFailure):
        host = parse_import_url(url).host
    try:
        async with asyncio.timeout(deadline):
            page = await _fetch(url, resolver, transport, max_bytes)
    except TimeoutError:
        logger.info("recipe import from %s: timeout", host)
        raise ImportFailure("timeout") from None
    except ImportFailure as exc:
        logger.info("recipe import from %s: %s", host, exc.code)
        raise
    logger.info("recipe import from %s: fetched", host)
    return page


class ImportLimiter:
    """At most ``limit`` imports at once; a further one waits briefly, then gets ``busy``."""

    def __init__(self, limit: int = MAX_CONCURRENT, wait: float = QUEUE_WAIT) -> None:
        self._semaphore = asyncio.Semaphore(limit)
        self._wait = wait

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), self._wait)
        except TimeoutError:
            raise ImportFailure("busy") from None
        try:
            yield
        finally:
            self._semaphore.release()
