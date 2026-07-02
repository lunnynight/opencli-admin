from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from backend.schemas.common import UTCModel


class PlanCreate(BaseModel):
    """Body for ``POST /plans``. ``graph`` is the raw Plan IR JSON document
    (validated through ``backend.plan_ir.validation.validate_plan_graph``
    before it is ever written) — accepted as a free-form dict rather than
    the ``PlanGraph`` model itself so the byte-faithful round-trip guarantee
    (issue 02 acceptance criterion) doesn't depend on Pydantic's own
    re-serialization of the graph."""

    name: str = Field(..., min_length=1, max_length=255)
    graph: dict[str, Any]


class PlanUpdate(BaseModel):
    """Body for ``PATCH /plans/{plan_id}``. Both fields optional so a caller
    can rename a Plan without resubmitting its graph, or vice versa; when
    ``graph`` is supplied it goes through the same validator as create and
    bumps ``version``."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    graph: Optional[dict[str, Any]] = None


class PlanRead(UTCModel):
    id: str
    name: str
    graph: dict[str, Any]
    version: int
    #: True if the graph contains any unmaterialized Draft Source Node
    #: (no source_id, draft=True) — draft Plans save fine but never enter
    #: any control loop (issue 02 acceptance criterion; scheduling hooks
    #: are issue 05's scope, not this one's).
    draft: bool
    #: True only when every source node in the graph is materialized
    #: (source_id set, draft=False) — the PRD's "runnable end-to-end by the
    #: backend" bar (story 10). A Plan with zero source nodes at all is not
    #: runnable either (nothing to execute).
    runnable: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
