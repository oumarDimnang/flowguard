"""Worker entry point.

The agent is a pure Temporal worker: it connects *outbound* to the task queue
and polls. It exposes no HTTP port and accepts no inbound connections at all —
Nokia's callbacks terminate at the NestJS server and arrive here as signals.

Run with::

    uv run flowguard-worker
"""

from __future__ import annotations

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.worker import Worker

from .activities.emit import EmitActivities
from .activities.network import NetworkActivities
from .activities.reasoning import ReasoningActivities
from .config import Settings, get_settings
from .graph.assessment_graph import build_assessment_graph
from .graph.evidence import HeuristicEvidenceGatherer
from .llm.client import build_classifier
from .network.mock_provider import MockNetworkProvider
from .network.provider import NetworkProvider
from .observability.langfuse_setup import flush as flush_traces
from .observability.temporal_interceptor import LangfuseInterceptor
from .workflows.critical_operation import CriticalOperationWorkflow

logger = logging.getLogger(__name__)


def build_provider(settings: Settings) -> NetworkProvider:
    """Select the network provider from configuration.

    This one line is the difference between a demo that cannot fail and a demo
    that depends on a live sandbox.
    """
    if settings.network_provider == "nokia":
        from .network.nokia_provider import NokiaNetworkProvider

        logger.info("Using Nokia Network as Code provider")
        return NokiaNetworkProvider(
            api_key=settings.nokia_api_key,
            base_url=settings.nokia_base_url,
            rapidapi_host=settings.nokia_rapidapi_host,
            qos_profile=settings.nokia_qos_profile,
            application_server_ipv4=settings.nokia_application_server_ipv4,
            slice_id=settings.nokia_slice_id or None,
            webhook_base_url=settings.webhook_base_url or None,
            webhook_token=settings.nokia_webhook_token,
        )

    logger.info("Using offline mock network provider")
    return MockNetworkProvider()


def _export_langfuse_env(settings: Settings) -> None:
    """The Langfuse SDK reads credentials from the environment.

    Settings are the single source of truth for configuration here, so they are
    exported rather than requiring the same values to be set twice.
    """
    if not settings.langfuse_enabled:
        return

    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
    os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)
    os.environ.setdefault("LANGFUSE_BASE_URL", settings.langfuse_host)


async def run_worker() -> None:
    settings = get_settings()
    _export_langfuse_env(settings)

    provider = build_provider(settings)

    # Long-lived resources are prepared once, before any operation runs: the
    # congestion subscription Nokia requires before queries return data, and the
    # network slice, which takes minutes to activate and therefore cannot be
    # created inside a two-second decision window.
    await provider.bootstrap()

    classifier = build_classifier(settings)

    # Deterministic tool selection offline; the model picks its own tools when a
    # real LLM is configured. Either way the toolset is read-only.
    if settings.llm_provider == "openrouter":
        from .graph.evidence import LLMEvidenceGatherer
        from .llm.client import build_chat_model

        gatherer = LLMEvidenceGatherer(build_chat_model(settings))
    else:
        gatherer = HeuristicEvidenceGatherer()

    graph = build_assessment_graph(
        classifier,
        evidence_gatherer=gatherer,
        confidence_threshold=settings.llm_confidence_threshold,
        escalation_model=settings.fallback_models[0] if settings.fallback_models else None,
    )

    network_activities = NetworkActivities(provider, qos_profile=settings.nokia_qos_profile)
    reasoning_activities = ReasoningActivities(graph, provider)
    emit_activities = EmitActivities(
        base_url=settings.server_base_url,
        token=settings.internal_api_token,
    )

    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )

    # One trace per workflow run, one span per activity — added at the worker
    # so no activity has to know tracing exists.
    interceptors = [LangfuseInterceptor()] if settings.langfuse_enabled else []

    worker = Worker(
        client,
        interceptors=interceptors,
        task_queue=settings.temporal_task_queue,
        workflows=[CriticalOperationWorkflow],
        activities=[
            network_activities.check_device_status,
            network_activities.query_congestion,
            network_activities.allocate,
            network_activities.poll_qod,
            network_activities.extend_qod,
            network_activities.release,
            reasoning_activities.assess_criticality,
            emit_activities.emit_decision,
        ],
    )

    logger.info(
        "FlowGuard worker polling '%s' at %s (network=%s, llm=%s, tracing=%s)",
        settings.temporal_task_queue,
        settings.temporal_address,
        settings.network_provider,
        settings.llm_provider,
        "langfuse" if settings.langfuse_enabled else "off",
    )

    try:
        await worker.run()
    finally:
        # The SDK batches asynchronously; without this the final operations of a
        # session never reach Langfuse.
        flush_traces()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        logger.info("Worker stopped")


if __name__ == "__main__":
    main()
