"""Configuration, validated once at import.

Mirrors the server's fail-fast philosophy: a missing or malformed value should
kill the worker at startup with a readable message rather than surfacing as a
failed activity thirty seconds into a demo.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Temporal ──────────────────────────────────────────────────────
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    # Must match TEMPORAL_TASK_QUEUE in the server, or workflows start and
    # then sit unclaimed on a queue nobody polls.
    temporal_task_queue: str = "flowguard"

    # ── FlowGuard server ──────────────────────────────────────────────
    server_base_url: str = "http://localhost:3000"
    internal_api_token: str = "change-me-internal-token"

    # ── Network provider ──────────────────────────────────────────────
    # "mock" runs the entire loop offline with deterministic congestion —
    # which is also the safest mode to demo in.
    network_provider: Literal["mock", "nokia"] = "mock"
    nokia_api_key: str = ""
    #: Regional API hub. Note the 'p-eu' — this differs by region.
    nokia_base_url: str = "https://network-as-code.p-eu.apihub.nokia.io"
    nokia_rapidapi_host: str = "network-as-code.nokia.rapidapi.com"
    #: Verified against the sandbox playground. Profile names are NOT portable:
    #: Nokia's TypeScript examples use "QOS_L", which this API rejects.
    nokia_qos_profile: str = "DOWNLINK_M_UPLINK_L"
    #: Far end of the protected flow, required by QoD create-session.
    nokia_application_server_ipv4: str = "8.8.8.8"
    nokia_slice_id: str = ""
    webhook_base_url: str = ""
    nokia_webhook_token: str = "change-me-nokia-webhook-token"

    # ── LLM ───────────────────────────────────────────────────────────
    llm_provider: Literal["mock", "openrouter"] = "mock"
    openrouter_api_key: str = ""
    llm_model: str = "openai/gpt-5.6-luna"
    llm_fallback_models: str = "openai/gpt-5.6-terra"
    llm_confidence_threshold: float = Field(default=0.80, ge=0.0, le=1.0)

    # ── Observability ─────────────────────────────────────────────────
    #: Off by default. Tracing is a development aid, not a runtime dependency —
    #: the agent must run identically with it disabled.
    langfuse_enabled: bool = False
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # ── Decision policy ───────────────────────────────────────────────
    # Grant QoD to safety-critical work even on an uncongested network.
    # Costs money; protects unconditionally. Off by default, because the
    # headline saving comes from NOT allocating when nothing is at risk.
    policy_always_protect_safety_critical: bool = False
    # If criticality assessment fails outright, assume HIGH (protect, pay) or
    # LOW (save, expose)? Defaults to protecting.
    policy_fail_open: bool = True

    @field_validator("langfuse_secret_key")
    @classmethod
    def _require_keys_for_langfuse(cls, value: str, info) -> str:
        if info.data.get("langfuse_enabled") and not (
            value and info.data.get("langfuse_public_key")
        ):
            raise ValueError(
                "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required "
                "when LANGFUSE_ENABLED=true"
            )
        return value

    @field_validator("nokia_api_key")
    @classmethod
    def _require_key_for_nokia(cls, value: str, info) -> str:
        if info.data.get("network_provider") == "nokia" and not value:
            raise ValueError("NOKIA_API_KEY is required when NETWORK_PROVIDER=nokia")
        return value

    @field_validator("openrouter_api_key")
    @classmethod
    def _require_key_for_openrouter(cls, value: str, info) -> str:
        if info.data.get("llm_provider") == "openrouter" and not value:
            raise ValueError("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter")
        return value

    @property
    def fallback_models(self) -> list[str]:
        return [m.strip() for m in self.llm_fallback_models.split(",") if m.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
