"""Probe every Nokia endpoint FlowGuard depends on and report what works.

Only the Quality on Demand contract was read directly from the account
playground. The other three paths are inferred from the catalog's naming
convention, so this script exists to turn them into facts: it calls each one and
prints the status, making a wrong path a one-line fix rather than a hunt through
a failing workflow.

Run from the agent directory, with NOKIA_API_KEY set in .env::

    uv run python scripts/verify_nokia.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import httpx

from flowguard_agent.config import get_settings
from flowguard_agent.network.nokia_provider import (
    PATH_CONGESTION_QUERY,
    PATH_CONGESTION_SUBSCRIPTIONS,
    PATH_DEVICE_REACHABILITY,
    PATH_LOCATION_RETRIEVE,
    PATH_LOCATION_VERIFY,
    PATH_QOD_SESSIONS,
    PATH_SLICE_ATTACH,
    PATH_SLICES,
)

#: Phone number alone — what most of the playground examples send.
MINIMAL_DEVICE = {"phoneNumber": "+99999991000"}

#: The fuller identifier QoD's example supplies.
TEST_DEVICE = {
    "phoneNumber": "+99999991001",
    "ipv4Address": {
        "publicAddress": "233.252.0.2",
        "privateAddress": "192.0.2.25",
        "publicPort": 80,
    },
}

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


async def probe(
    client: httpx.AsyncClient,
    label: str,
    method: str,
    path: str,
    payload: dict | None = None,
) -> tuple[str, int, str]:
    try:
        response = await client.request(method, path, json=payload)
    except Exception as exc:  # noqa: BLE001 - reporting tool
        return label, 0, f"{type(exc).__name__}: {exc}"

    snippet = response.text.strip().replace("\n", " ")[:220]
    return label, response.status_code, snippet


def verdict(status: int) -> str:
    if 200 <= status < 300:
        return f"{GREEN}WORKS{RESET}"
    if status == 404:
        return f"{RED}WRONG PATH{RESET}"
    if status in (401, 403):
        return f"{RED}AUTH{RESET}"
    if status == 429:
        return f"{YELLOW}RATE LIMITED{RESET}"
    if status == 0:
        return f"{RED}NETWORK{RESET}"
    # 4xx other than the above usually means the path is right but the body is
    # not — which is still useful news.
    return f"{YELLOW}REACHED (body needs work){RESET}"


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

    print(f"\nProbing {settings.nokia_base_url}\n" + "─" * 78)

    async with httpx.AsyncClient(
        base_url=settings.nokia_base_url, headers=headers, timeout=25.0
    ) as client:
        checks = [
            # VERIFIED from the playground — this one should pass outright.
            (
                "Quality on Demand  create session",
                "POST",
                PATH_QOD_SESSIONS,
                {
                    "device": TEST_DEVICE,
                    "applicationServer": {"ipv4Address": settings.nokia_application_server_ipv4},
                    "qosProfile": settings.nokia_qos_profile,
                    "duration": 60,
                },
            ),
            # INFERRED paths below.
            # Reachability, location and congestion take the phone number
            # alone — that is what their playground examples show.
            (
                "Device Reachability  retrieve",
                "POST",
                PATH_DEVICE_REACHABILITY,
                {"device": MINIMAL_DEVICE},
            ),
            (
                "Congestion Insights  query",
                "POST",
                PATH_CONGESTION_QUERY,
                {"device": MINIMAL_DEVICE},
            ),
            (
                "Congestion Insights  subscriptions",
                "GET",
                PATH_CONGESTION_SUBSCRIPTIONS,
                None,
            ),
            ("Network Slicing  list", "GET", PATH_SLICES, None),
            # Listed rather than created: a successful POST would attach a real
            # device to a slice.
            ("Slice Device Attach  list", "GET", PATH_SLICE_ATTACH, None),
            (
                "Location Verification  verify",
                "POST",
                PATH_LOCATION_VERIFY,
                {
                    "device": MINIMAL_DEVICE,
                    "area": {
                        "areaType": "CIRCLE",
                        "center": {"latitude": 26.2041, "longitude": 50.6050},
                        "radius": 50000,
                    },
                },
            ),
            (
                # maxAge is REQUIRED here — omitting it returns 422 with an
                # empty detail, which says nothing about why.
                "Location Retrieval  retrieve",
                "POST",
                PATH_LOCATION_RETRIEVE,
                {"device": MINIMAL_DEVICE, "maxAge": 60},
            ),
        ]

        results = []
        created_session: str | None = None

        for label, method, path, payload in checks:
            label, status, snippet = await probe(client, label, method, path, payload)
            results.append((label, path, status))
            print(f"{verdict(status):<32} {label}")
            print(f"{DIM}    {method} {path}  ->  {status}{RESET}")
            if snippet:
                print(f"{DIM}    {snippet}{RESET}")
            print()

            if "Quality on Demand" in label and 200 <= status < 300:
                try:
                    created_session = json.loads(snippet or "{}").get("sessionId")
                except json.JSONDecodeError:
                    pass

        # Do not leave a live session running against the sandbox.
        if created_session:
            _, status, _ = await probe(
                client, "cleanup", "DELETE", f"{PATH_QOD_SESSIONS}/{created_session}"
            )
            print(f"{DIM}Cleaned up test session {created_session} ({status}){RESET}\n")

    print("─" * 78)
    broken = [(label, path) for label, path, status in results if status == 404]
    if broken:
        print(f"\n{RED}Wrong paths — send these to fix nokia_provider.py:{RESET}")
        for label, path in broken:
            print(f"  • {label}: {path}")
    else:
        print(f"\n{GREEN}All five endpoints reachable.{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
