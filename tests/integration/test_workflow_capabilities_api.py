import pytest


def _webhook_notify_project() -> dict:
    return {
        "id": "wf-webhook-contract",
        "name": "Webhook contract",
        "profile": "intelligence",
        "version": 1,
        "nodes": [
            {
                "id": "source-bilibili",
                "kind": "source",
                "capability": "fetch",
                "adapter": "opencli-bilibili",
                "params": {"site": "bilibili", "command": "search"},
            },
            {
                "id": "notify-webhook",
                "kind": "notify",
                "capability": "send",
                "adapter": "webhook-notifier",
                "params": {"template": "brief", "target": "webhook"},
                "ui": {"catalogId": "intelligence.output.webhook"},
            },
        ],
        "edges": [
            {
                "id": "e-source-notify",
                "source": "source-bilibili",
                "target": "notify-webhook",
            }
        ],
        "adapters": [
            {
                "id": "opencli-bilibili",
                "type": "source",
                "provider": "opencli",
                "mode": "live",
                "config": {"channel": "opencli"},
            },
            {
                "id": "webhook-notifier",
                "type": "notification",
                "provider": "webhook",
                "mode": "webhook",
                "config": {"notifierType": "webhook", "target": "webhook"},
            },
        ],
        "agentPermissions": {
            "canFetchNetwork": True,
            "canSendNotifications": False,
            "canWriteInbox": True,
        },
    }


@pytest.mark.asyncio
async def test_compile_reports_webhook_notify_contract_without_live_delivery(client):
    response = await client.post(
        "/api/v1/workflows/compile",
        json={"project": _webhook_notify_project()},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["valid"] is True
    node = next(
        node
        for node in data["plan"]["runtime"]["nodes"]
        if node["id"] == "notify-webhook"
    )
    assert node["runtime"]["origin"]["catalog_id"] == "intelligence.output.webhook"
    assert "binding" not in node["runtime"]
    assert node["runtime"]["notifier"]["binding_id"] == "workflow.notifier.webhook.send"
    assert node["runtime"]["notifier"]["dispatch"] == "blocked_until_projection"
    assert node["runtime"]["notifier"]["input"]["delivery_configured"] is False
    assert node["runtime"]["missing_runtime"] == {
        "status": "missing",
        "code": "missing_delivery_projection",
        "node_id": "notify-webhook",
        "kind": "notify",
        "capability": "send",
        "adapter_id": "webhook-notifier",
        "provider": "webhook",
        "required_params": [
            "evidencebatch_projection_api",
            "delivery_projection",
            "webhook_url",
        ],
        "message": (
            "Webhook Notify has a backend notifier contract, but live delivery "
            "waits for EvidenceBatch projection and a configured webhook URL."
        ),
    }


@pytest.mark.asyncio
async def test_workflow_capabilities_project_real_backend_surfaces(client):
    response = await client.get("/api/v1/workflows/capabilities")

    assert response.status_code == 200
    data = response.json()["data"]

    catalog = {item["id"]: item for item in data["catalog"]}
    assert catalog["intelligence.input.collection-need"]["status"] == "runnable"
    assert catalog["intelligence.input.collection-need"]["backendAvailable"] is True
    assert catalog["intelligence.input.collection-need"]["runtimeBinding"] == (
        "workflow.demand-draft.patch"
    )
    assert catalog["intelligence.schedule.cron"]["status"] == "runnable"
    assert catalog["intelligence.schedule.cron"]["backendAvailable"] is True
    assert catalog["intelligence.schedule.cron"]["runtimeBinding"] == (
        "workflow.trigger.schedule_tick"
    )
    assert "workflow_trigger_binding" not in catalog["intelligence.schedule.cron"]["missing"]
    assert catalog["intelligence.source.opencli-slot"]["status"] == "runnable"
    assert catalog["intelligence.source.opencli-slot"]["backendAvailable"] is True
    assert catalog["intelligence.source.opencli-slot"]["runtimeBinding"]
    assert "frontend_run_event_binding" not in catalog["intelligence.source.opencli-slot"]["missing"]
    assert catalog["package.opencli.multi-source-hda"]["status"] == "runnable"
    assert "frontend_run_event_binding" not in catalog["package.opencli.multi-source-hda"]["missing"]
    assert "typed_demand_input_envelope" not in catalog["package.opencli.multi-source-hda"]["missing"]
    assert catalog["intelligence.output.webhook"]["status"] == "blocked"
    assert catalog["intelligence.output.webhook"]["backendAvailable"] is True
    assert catalog["intelligence.output.webhook"]["runtimeBinding"] == (
        "workflow.notifier.webhook.send"
    )
    assert "workflow_notifier_sink_binding" not in catalog["intelligence.output.webhook"]["missing"]
    assert "delivery_projection" in catalog["intelligence.output.webhook"]["missing"]

    channels = {item["channelType"]: item for item in data["channels"]}
    assert set(channels) == {
        "api",
        "cli",
        "crawl4ai",
        "opencli",
        "rss",
        "skill",
        "web_scraper",
    }
    assert channels["opencli"]["status"] == "runnable"
    assert channels["opencli"]["backendAvailable"] is True
    assert channels["rss"]["status"] == "blocked"
    assert channels["rss"]["backendAvailable"] is True
    assert "canvas_source_projection" in channels["rss"]["missing"]

    notifiers = {item["notifierType"]: item for item in data["notifiers"]}
    assert "webhook" in notifiers
    assert notifiers["webhook"]["status"] == "blocked"
    assert notifiers["webhook"]["backendAvailable"] is True
    assert notifiers["webhook"]["runtimeBinding"] == "workflow.notifier.webhook.send"
    assert "delivery_projection" in notifiers["webhook"]["missing"]

    primitives = {item["id"]: item for item in data["primitives"]}
    assert primitives["primitive.ops.trigger-webhook"]["status"] == "blocked"
    assert primitives["primitive.ops.trigger-webhook"]["backendAvailable"] is True

    triggers = {item["id"]: item for item in data["triggers"]}
    assert triggers["trigger.manual"]["status"] == "runnable"
    assert triggers["trigger.manual"]["missing"] == []
    assert triggers["trigger.webhook"]["status"] == "blocked"
