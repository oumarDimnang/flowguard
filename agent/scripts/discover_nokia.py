"""Probe Nokia request shapes when a path is right but the body is rejected.

Every endpoint path is now confirmed. The remaining unknown is Location
Retrieval, which returns **422 with an empty `{"detail": ""}`** — the path
exists, the body does not satisfy it, and the error says nothing about why.

This tries body variants against that endpoint and reports which is accepted.
A 422 means "wrong body", a 200 means the shape is right.

Repoint the CANDIDATES table at whatever is unknown next; the probe itself is
generic.

    uv run python scripts/discover_nokia.py
"""

from __future__ import annotations

import asyncio
import sys

import httpx

from flowguard_agent.config import get_settings

#: The sandbox test device, from the account playground.
DEVICE = {
    "phoneNumber": "+99999991001",
    "ipv4Address": {
        "publicAddress": "233.252.0.2",
        "privateAddress": "192.0.2.25",
        "publicPort": 80,
    },
}

DEVICE_BODY = {"device": DEVICE}

GREEN, RED, DIM, BOLD, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[1m", "\033[0m"

#: (label, method, path, body). Ordered most- to least-likely.
MINIMAL = {"phoneNumber": "+99999991000"}

CANDIDATES: dict[str, list[tuple[str, str, dict | None]]] = {
    "Location Retrieval body (path /location-retrieval/v0/retrieve confirmed)": [
        # maxAge may be unsupported at v0, or may have a minimum this misses.
        ("POST", "/location-retrieval/v0/retrieve", {"device": MINIMAL}),
        ("POST", "/location-retrieval/v0/retrieve", {"device": MINIMAL, "maxAge": 60}),
        ("POST", "/location-retrieval/v0/retrieve", {"device": MINIMAL, "maxAge": 3600}),
        (
            "POST",
            "/location-retrieval/v0/retrieve",
            {"device": MINIMAL, "maxAge": 60, "maxSurface": 1000000},
        ),
        # Location Verification accepted the fuller QoD-style identifier, so the
        # same device block is worth trying here.
        (
            "POST",
            "/location-retrieval/v0/retrieve",
            {
                "device": {
                    "phoneNumber": "+99999991001",
                    "ipv4Address": {
                        "publicAddress": "233.252.0.2",
                        "privateAddress": "192.0.2.25",
                        "publicPort": 80,
                    },
                }
            },
        ),
        # Some CAMARA deployments nest the request rather than flattening it.
        ("POST", "/location-retrieval/v0/retrieve", {"retrievalRequest": {"device": MINIMAL}}),
        ("POST", "/location-retrieval/v0/retrieve", MINIMAL),
    ],
}


async def probe(
    client: httpx.AsyncClient, method: str, path: str, body: dict | None
) -> tuple[int, str]:
    try:
        response = await client.request(method, path, json=body)
    except Exception as exc:  # noqa: BLE001 - discovery tool
        return 0, f"{type(exc).__name__}: {exc}"
    return response.status_code, response.text.strip().replace("\n", " ")[:200]


def describe(body: dict | None) -> str:
    """One-line summary of a request body, for telling candidates apart."""
    if body is None:
        return "(no body)"
    return "{" + ", ".join(sorted(body)) + "}"


def is_missing(status: int, snippet: str) -> bool:
    """A miss is a path that does not exist, or a body the endpoint rejected."""
    if status == 404 and "does not exist" in snippet:
        return True
    return status == 422


async def main() -> int:
    settings = get_settings()

    if not settings.nokia_api_key:
        print(f"{RED}NOKIA_API_KEY is not set.{RESET} Put it in agent/.env and re-run.")
        return 1

    headers = {
        "Content-Type": "application/json",
        "x-rapidapi-key": settings.nokia_api_key,
        "x-rapidapi-host": settings.nokia_rapidapi_host,
    }

    print(f"\nProbing {settings.nokia_base_url}")
    print("Anything that is not a 404 means the path exists.\n" + "─" * 78)

    found: dict[str, list[str]] = {}

    async with httpx.AsyncClient(
        base_url=settings.nokia_base_url, headers=headers, timeout=20.0
    ) as client:
        for api, candidates in CANDIDATES.items():
            print(f"\n{BOLD}{api}{RESET}")
            hits: list[str] = []

            for method, path, body in candidates:
                status, snippet = await probe(client, method, path, body)
                # When several candidates share a path and differ only by body,
                # the body is the thing worth printing.
                label = f"{method} {path}  {describe(body)}"

                if is_missing(status, snippet):
                    print(f"  {DIM}{status:<4} {label}{RESET}")
                    continue

                marker = GREEN if status < 400 else RED
                print(f"  {marker}{status:<4}{RESET} {BOLD}{label}{RESET}")
                print(f"       {DIM}{snippet}{RESET}")
                hits.append(f"{label} -> {status}")

            if hits:
                found[api] = hits

    print("\n" + "─" * 78)
    if found:
        print(f"\n{GREEN}Paths that exist — send these back:{RESET}\n")
        for api, hits in found.items():
            print(f"  {BOLD}{api}{RESET}")
            for hit in hits:
                print(f"    {hit}")
    else:
        print(
            f"\n{RED}No candidate matched.{RESET} Open each endpoint in the Nokia portal "
            "and copy the --url line from its cURL snippet instead."
        )

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
