"""Pure rules deciding which URLs and addresses the server may fetch (SSRF defence)."""

import ipaddress
import re
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import urlsplit

from cociboard.recipe_import.errors import ImportFailure

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address

MAX_URL_LENGTH = 2000
ALLOWED_PORTS = (80, 443)
DEFAULT_PORTS = {"http": 80, "https": 443}

# Ranges that must never be reached, on top of ``is_global`` (whose answer varies a little
# between Python versions). Embedded IPv4 forms are unwrapped before these are consulted.
_BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",  # carrier-grade NAT
        "127.0.0.0/8",
        "169.254.0.0/16",  # link-local, cloud metadata
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "::/8",  # unspecified, loopback, IPv4-compatible
        "100::/64",  # discard-only
        "2001::/23",  # IETF protocol assignments
        "2001:db8::/32",
        "fc00::/7",  # unique local
        "fe80::/10",  # link-local
        "fec0::/10",  # deprecated site-local
        "ff00::/8",
    )
)
_NAT64 = ipaddress.ip_network("64:ff9b::/96")
# Last label of an old-style numeric host ("2130706433", "0x7f.1"): resolvers read it as an IP.
_NUMERIC_LABEL = re.compile(r"^(0x[0-9a-f]*|\d+)$")


def _embedded_ipv4(ip: IPAddress) -> list[ipaddress.IPv4Address]:
    """IPv4 addresses an IPv6 address smuggles in (mapped, 6to4, Teredo, NAT64)."""
    if not isinstance(ip, ipaddress.IPv6Address):
        return []
    if ip.ipv4_mapped is not None:
        return [ip.ipv4_mapped]
    if ip.sixtofour is not None:
        return [ip.sixtofour]
    if ip.teredo is not None:
        return list(ip.teredo)
    if ip in _NAT64:
        return [ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)]
    return []


def is_public_address(ip: IPAddress) -> bool:
    """Whether ``ip`` is a public unicast address that is safe to connect to."""
    embedded = _embedded_ipv4(ip)
    if embedded:
        return all(is_public_address(inner) for inner in embedded)
    if not ip.is_global or ip.is_multicast or ip.is_private or ip.is_loopback:
        return False
    if ip.is_link_local or ip.is_reserved or ip.is_unspecified:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.is_site_local:
        return False
    return not any(ip in net for net in _BLOCKED_NETWORKS if net.version == ip.version)


def parse_address(text: str) -> IPAddress | None:
    """The IP address ``text`` spells out, or ``None`` when it is not an IP literal."""
    try:
        return ipaddress.ip_address(text)
    except ValueError:
        return None


def vet_addresses(addresses: Sequence[str]) -> list[IPAddress]:
    """Return the resolved addresses, or raise when none exists or any is not public.

    Every address must be public, not just the one that will be used: a name that also
    points inside the network is refused outright.
    """
    parsed: list[IPAddress] = []
    for text in addresses:
        ip = parse_address(text.split("%", 1)[0])
        if ip is None or not is_public_address(ip):
            raise ImportFailure("blocked_address")
        if ip not in parsed:
            parsed.append(ip)
    if not parsed:
        raise ImportFailure("fetch_failed")
    return parsed


@dataclass(frozen=True)
class ImportTarget:
    """A validated http(s) URL, split for a pinned request."""

    scheme: str
    host: str  # lower-case, IDNA-encoded, IPv6 without brackets
    port: int
    path: str  # path and query, never empty
    url: str  # normalised, without fragment

    @property
    def host_header(self) -> str:
        """Value of the ``Host`` header: the host, with the port when it is not the default."""
        host = f"[{self.host}]" if ":" in self.host else self.host
        return host if self.port == DEFAULT_PORTS[self.scheme] else f"{host}:{self.port}"


def parse_import_url(url: str) -> ImportTarget:
    """Validate ``url`` for import. Raises ``ImportFailure("invalid_url")`` or ``blocked_address``.

    Only absolute http(s) URLs with a host, no userinfo and port 80 or 443 are accepted.
    """
    text = url.strip()
    if not text or len(text) > MAX_URL_LENGTH:
        raise ImportFailure("invalid_url")
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise ImportFailure("invalid_url")
    try:
        parts = urlsplit(text)
        hostname = parts.hostname
        port = parts.port
    except ValueError:
        raise ImportFailure("invalid_url") from None
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORTS or not hostname:
        raise ImportFailure("invalid_url")
    if "@" in parts.netloc or "\\" in text:
        raise ImportFailure("invalid_url")
    if port is not None and port not in ALLOWED_PORTS:
        raise ImportFailure("invalid_url")
    host = hostname.lower()
    if "%" in host:
        raise ImportFailure("invalid_url")
    if not host.isascii():
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError:
            raise ImportFailure("invalid_url") from None
    if parse_address(host) is None and _NUMERIC_LABEL.match(host.rstrip(".").rsplit(".", 1)[-1]):
        raise ImportFailure("blocked_address")  # legacy numeric IP spelling
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    port = port or DEFAULT_PORTS[scheme]
    bracketed = f"[{host}]" if ":" in host else host
    shown_port = "" if port == DEFAULT_PORTS[scheme] else f":{port}"
    return ImportTarget(scheme, host, port, path, f"{scheme}://{bracketed}{shown_port}{path}")
