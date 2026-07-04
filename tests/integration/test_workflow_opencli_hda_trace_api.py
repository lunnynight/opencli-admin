"""HTTP-seam tests for Multi Source OpenCLI HDA tracing."""

import pytest


def _multi_source_opencli_hda_project() -> dict:
    return {
        "id": "wf-opencli-hda",
        "name": "Multi source OpenCLI HDA",
        "profile": "intelligence",
        "version": 1,
        "nodes": [
            {
                "id": "multi-source-opencli",
                "kind": "agent",
                "capability": "normalize",
                "topicCollapse": {
                    "groupId": "opencli-package",
                    "nodeCount": 3,
                    "mode": "draft",
                    "packageInternal": True,
                },
                "internals": {
                    "nodes": [
                        {
                            "id": "source-bilibili",
                            "kind": "source",
                            "capability": "fetch",
                            "adapter": "opencli-bilibili",
                            "params": {
                                "site": "bilibili",
                                "command": "search",
                                "args": {"keyword": "ai"},
                                "sourceGroup": "video",
                            },
                        },
                        {
                            "id": "source-xiaohongshu",
                            "kind": "source",
                            "capability": "fetch",
                            "adapter": "opencli-xiaohongshu",
                            "params": {
                                "site": "xiaohongshu",
                                "command": "search",
                                "args": {"keyword": "ai"},
                                "sourceGroup": "social",
                            },
                        },
                        {
                            "id": "internal-normalize",
                            "kind": "agent",
                            "capability": "normalize",
                            "params": {"language": "zh-CN"},
                        },
                    ],
                    "edges": [
                        {
                            "id": "bilibili-normalize",
                            "source": "source-bilibili",
                            "target": "internal-normalize",
                        },
                        {
                            "id": "xiaohongshu-normalize",
                            "source": "source-xiaohongshu",
                            "target": "internal-normalize",
                        },
                    ],
                },
            }
        ],
        "edges": [],
        "adapters": [
            {
                "id": "opencli-bilibili",
                "type": "source",
                "provider": "opencli",
                "mode": "live",
                "config": {"channel": "opencli"},
            },
            {
                "id": "opencli-xiaohongshu",
                "type": "source",
                "provider": "opencli",
                "mode": "live",
                "config": {"channel": "opencli"},
            },
        ],
        "agentPermissions": {
            "canFetchNetwork": True,
            "canSendNotifications": False,
            "canWriteInbox": True,
            "allowedDomains": ["bilibili.com", "xiaohongshu.com"],
        },
    }


@pytest.mark.asyncio
async def test_opencli_hda_trace_builds_iii_fanout_payloads(client):
    response = await client.post(
        "/api/v1/workflows/opencli-hda/trace",
        json={
            "project": _multi_source_opencli_hda_project(),
            "packageNodeId": "multi-source-opencli",
            "runId": "run-001",
            "traceId": "trace-001",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["valid"] is True
    assert data["errors"] == []
    assert data["workflowId"] == "wf-opencli-hda"
    assert data["runId"] == "run-001"
    assert data["traceId"] == "trace-001"
    assert data["packageNodeId"] == "multi-source-opencli"
    assert data["dispatch"] == {
        "runtime": "iii",
        "worker": "collector-opencli",
        "functionId": "odp.collect::opencli_snapshot",
        "mode": "trigger_envelope",
    }

    dispatches = data["dispatches"]
    assert [dispatch["nodeId"] for dispatch in dispatches] == [
        "multi-source-opencli::source-bilibili",
        "multi-source-opencli::source-xiaohongshu",
    ]
    first = dispatches[0]
    assert first["packageNodeId"] == "multi-source-opencli"
    assert first["internalNodeId"] == "source-bilibili"
    assert first["sourceGroup"] == "video"
    assert first["site"] == "bilibili"
    assert first["command"] == "search"
    assert first["args"] == {"keyword": "ai"}
    assert first["iii"] == {
        "function_id": "odp.collect::opencli_snapshot",
        "payload": {
            "workflow_id": "wf-opencli-hda",
            "workflow_run_id": "run-001",
            "package_node_id": "multi-source-opencli",
            "node_id": "multi-source-opencli::source-bilibili",
            "internal_node_id": "source-bilibili",
            "source_group": "video",
            "site": "bilibili",
            "command": "search",
            "args": {"keyword": "ai"},
            "format": "json",
            "task_id": first["taskId"],
            "trace_id": "trace-001",
        },
    }


@pytest.mark.asyncio
async def test_opencli_hda_trace_reuses_collector_opencli_instead_of_odp_direct(client):
    response = await client.post(
        "/api/v1/workflows/opencli-hda/trace",
        json={
            "project": _multi_source_opencli_hda_project(),
            "packageNodeId": "multi-source-opencli",
            "runId": "run-001",
            "traceId": "trace-001",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["valid"] is True
    assert data["dispatch"]["worker"] == "collector-opencli"
    assert data["dispatch"]["functionId"] == "odp.collect::opencli_snapshot"
    for dispatch in data["dispatches"]:
        assert dispatch["iii"]["function_id"] == "odp.collect::opencli_snapshot"
        assert dispatch["iii"]["function_id"] != "odp.ingest::batch"
        assert "events" not in dispatch["iii"]["payload"]
        assert "records" not in dispatch["iii"]["payload"]


@pytest.mark.asyncio
async def test_opencli_hda_trace_reports_package_without_opencli_source_bindings(client):
    project = _multi_source_opencli_hda_project()
    project["nodes"][0]["internals"]["nodes"] = [
        {
            "id": "internal-normalize",
            "kind": "agent",
            "capability": "normalize",
            "params": {"language": "zh-CN"},
        }
    ]
    project["nodes"][0]["internals"]["edges"] = []

    response = await client.post(
        "/api/v1/workflows/opencli-hda/trace",
        json={
            "project": project,
            "packageNodeId": "multi-source-opencli",
            "runId": "run-001",
            "traceId": "trace-001",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["valid"] is False
    assert data["dispatches"] == []
    assert data["errors"][0]["code"] == "missing_opencli_hda_sources"
    assert data["errors"][0]["node_id"] == "multi-source-opencli"
