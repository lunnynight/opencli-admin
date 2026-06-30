"""Write sinks: the destination seam for collected items.

Import the seam from here:

    from backend.pipeline.sinks import LegacyDbSink, ItemSink, RunContext, SinkResult
"""

from backend.pipeline.sinks.base import ItemSink, RunContext, SinkResult
from backend.pipeline.sinks.legacy_db_sink import LegacyDbSink

__all__ = ["ItemSink", "RunContext", "SinkResult", "LegacyDbSink"]
