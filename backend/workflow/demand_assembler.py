"""Assemble collection needs into reviewable WorkflowProject patches."""

from __future__ import annotations

import re
from typing import Any

from backend.schemas.workflow import (
    WorkflowDemandDraftRequest,
    WorkflowPatchOperation,
    WorkflowPatchResponse,
    WorkflowProject,
    WorkflowProjectNode,
    WorkflowTopicCollapse,
)
from backend.workflow.hda_templates import (
    OPENCLI_HDA_CATALOG_ID,
    OPENCLI_MULTI_SOURCE_TEMPLATE,
)
from backend.workflow.patcher import preview_workflow_patch


def draft_workflow_demand(body: WorkflowDemandDraftRequest) -> WorkflowPatchResponse:
    """Translate a user collection need into existing-node patch operations.

    This is intentionally deterministic and conservative. It never emits raw
    executors or OpenCLI payloads; it only updates or adds the existing OpenCLI
    HDA package when the requested source can be mapped to known source slots.
    """

    sources = _source_slots_for_need(body.text)
    if not sources:
        return preview_workflow_patch(
            body.project,
            [
                WorkflowPatchOperation(
                    op="request_missing_capability",
                    capability="collection.source.intent_mapping",
                    reason=(
                        "No existing Canvas source capability matched this collection need. "
                        "Add a real source/channel mapping before assembling runnable nodes."
                    ),
                )
            ],
        )

    node = _find_opencli_hda_node(body.project)
    params = {
        "sources": sources,
        "demand": {
            "text": body.text,
            "locale": body.locale,
            "source": "manual",
        },
    }
    if node:
        operations = [
            WorkflowPatchOperation(
                op="update_parameters",
                nodeId=node.id,
                params=params,
            )
        ]
    else:
        operations = [
            WorkflowPatchOperation(
                op="add_node",
                node=_opencli_hda_node(body.project, sources, body.text),
            )
        ]
    return preview_workflow_patch(body.project, operations)


def _find_opencli_hda_node(project: WorkflowProject) -> WorkflowProjectNode | None:
    for node in project.nodes:
        catalog_id = _read_string((node.ui or {}).get("catalogId"))
        template = _read_string(node.params.get("template"))
        if catalog_id == OPENCLI_HDA_CATALOG_ID or template == OPENCLI_MULTI_SOURCE_TEMPLATE:
            return node
    return None


def _opencli_hda_node(
    project: WorkflowProject,
    sources: list[dict[str, Any]],
    demand_text: str,
) -> WorkflowProjectNode:
    node_id = _unique_node_id(project, "opencli-demand-hda")
    return WorkflowProjectNode(
        id=node_id,
        kind="agent",
        capability="normalize",
        params={
            "template": OPENCLI_MULTI_SOURCE_TEMPLATE,
            "runtime": "iii",
            "lockedInternals": True,
            "sources": sources,
            "demand": {
                "text": demand_text,
                "source": "manual",
            },
        },
        topicCollapse=WorkflowTopicCollapse(
            groupId=node_id,
            nodeCount=len(sources) + 1,
            mode="locked",
            packageInternal=True,
        ),
        ui={
            "catalogId": OPENCLI_HDA_CATALOG_ID,
            "label": "OpenCLI Demand HDA",
            "position": {"x": 840, "y": 260},
        },
    )


def _source_slots_for_need(text: str) -> list[dict[str, Any]]:
    normalized = text.lower()
    slots: list[dict[str, Any]] = []
    keyword = _keyword_from_need(text)

    if any(token in normalized for token in ("小红书", "xiaohongshu", "xhs")):
        slots.append(
            {
                "id": "xiaohongshu",
                "label": "Xiaohongshu Search",
                "sourceGroup": "social",
                "site": "xiaohongshu",
                "command": "search",
                "args": {"keyword": keyword},
                "resourceTags": ["browser-session:xiaohongshu"],
            }
        )

    if any(token in normalized for token in ("哔哩", "bilibili", "b站", "bili")):
        slots.append(
            {
                "id": "bilibili",
                "label": "Bilibili Search",
                "sourceGroup": "video",
                "site": "bilibili",
                "command": "search",
                "args": {"keyword": keyword},
                "resourceTags": ["browser-session:bilibili"],
            }
        )

    return slots


def _keyword_from_need(text: str) -> str:
    value = text.strip()
    for pattern in (
        r"^(抓|采集|收集|监控|找|看)\s*",
        r"(小红书|xiaohongshu|xhs|哔哩哔哩|哔哩|bilibili|b站|bili)",
        r"(热帖|热门帖子|热门内容|hot posts?)",
    ):
        value = re.sub(pattern, " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value).strip(" ，,。")
    return value or "热门"


def _unique_node_id(project: WorkflowProject, base: str) -> str:
    used = {node.id for node in project.nodes}
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _read_string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
