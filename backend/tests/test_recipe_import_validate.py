import ipaddress

import pytest

from cociboard.recipe_import.errors import ImportFailure
from cociboard.recipe_import.validate import (
    is_public_address,
    parse_import_url,
    vet_addresses,
)

PUBLIC = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]
NOT_PUBLIC = [
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "0.1.2.3",
    "224.0.0.1",
    "255.255.255.255",
    "240.0.0.1",
    "192.0.0.8",
    "198.18.0.1",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::127.0.0.1",
    "2002:7f00:1::",  # 6to4 of 127.0.0.1
    "2002:0a00:0001::",  # 6to4 of 10.0.0.1
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",  # Teredo
    "64:ff9b::7f00:1",  # NAT64 of 127.0.0.1
    "2001:db8::1",
]


@pytest.mark.parametrize("text", PUBLIC)
def test_public_addresses_pass(text: str) -> None:
    assert is_public_address(ipaddress.ip_address(text))


@pytest.mark.parametrize("text", NOT_PUBLIC)
def test_internal_addresses_are_refused(text: str) -> None:
    assert not is_public_address(ipaddress.ip_address(text))


def test_mapped_public_address_is_public() -> None:
    assert is_public_address(ipaddress.ip_address("::ffff:8.8.8.8"))


def test_one_private_address_among_public_ones_refuses_the_host() -> None:
    with pytest.raises(ImportFailure) as exc:
        vet_addresses(["8.8.8.8", "10.0.0.1"])
    assert exc.value.code == "blocked_address"


def test_vet_addresses_dedupes_and_needs_one() -> None:
    assert [str(a) for a in vet_addresses(["8.8.8.8", "8.8.8.8"])] == ["8.8.8.8"]
    with pytest.raises(ImportFailure) as exc:
        vet_addresses([])
    assert exc.value.code == "fetch_failed"
    with pytest.raises(ImportFailure):
        vet_addresses(["fe80::1%eth0"])


def code_of(url: str) -> str:
    with pytest.raises(ImportFailure) as exc:
        parse_import_url(url)
    return exc.value.code


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "example.com/recipe",
        "/relative/path",
        "ftp://example.com/x",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "http://",
        "http:///path",
        "https://user:pass@example.com/",
        "https://user@example.com/",
        "https://example.com@evil.test/",
        "https://example.com:8080/",
        "https://example.com:22/",
        "http://example.com:0/",
        "https://example.com:notaport/",
        "https://exa mple.com/",
        "https://example.com/a\nb",
        "https://example.com\\@evil.test/",
        "https://" + "a" * 2000 + ".com/",
    ],
)
def test_invalid_urls(url: str) -> None:
    assert code_of(url) == "invalid_url"


@pytest.mark.parametrize(
    "url",
    ["http://2130706433/", "http://0x7f.1/", "http://017700000001/", "http://127.1/"],
)
def test_legacy_numeric_hosts_are_blocked(url: str) -> None:
    assert code_of(url) == "blocked_address"


def test_valid_urls_normalised() -> None:
    target = parse_import_url("  HTTPS://Example.COM/a/b?x=1#frag ")
    assert (target.scheme, target.host, target.port) == ("https", "example.com", 443)
    assert target.path == "/a/b?x=1"
    assert target.url == "https://example.com/a/b?x=1"
    assert target.host_header == "example.com"
    assert parse_import_url("http://example.com:80/").url == "http://example.com/"
    assert parse_import_url("https://example.com:443").path == "/"


def test_ip_literals_and_idn() -> None:
    v6 = parse_import_url("https://[2606:4700:4700::1111]/x")
    assert v6.host == "2606:4700:4700::1111"
    assert v6.host_header == "[2606:4700:4700::1111]"
    assert parse_import_url("http://8.8.8.8/").host == "8.8.8.8"
    assert parse_import_url("https://bücher.example/").host == "xn--bcher-kva.example"
    assert code_of("https://[fe80::1%25eth0]/") == "invalid_url"
