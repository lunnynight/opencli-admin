# OpenCLI Admin Context

OpenCLI Admin is an operations console for collection work that needs browser session control, scheduled collection, and operator review.

## Language

**Collection Operations Console**: The primary operator surface for turning collection work into captured, triaged, owned, stateful, and closed work. It is the product shape that contains Run Inbox, Data Sources, Live Collection View, and Diagnostic Canvas without making any one visualization the whole product.
_Avoid_: Dashboard wall, canvas-first app

**Collection Operations**: The operator-facing domain for deciding what should be collected, when collection should run, what recently happened, and which actions are currently safe. It groups Data Sources, Collection Plans, Recent Runs, and Node Actions without making a canvas the primary operating surface.
_Avoid_: Source Workflow Workbench, canvas-first operations

**Diagnostic Canvas**: A secondary view for understanding relationships among collection entities when troubleshooting or explaining system state. It is not the default place to configure routine collection work.
_Avoid_: Main workflow, primary operating surface

**Live Collection View**: The operator-facing view of an active collection run as it happens, including streamed progress, rendered browser or pipeline state, and run-specific artifacts. It is anchored to a Recent Run, not to the default configuration surface.
_Avoid_: Static task log, canvas-only monitoring

**Adaptive Run Surface**: The on-demand layout that opens the right Live Collection View panels for the active run type. It should reveal pipeline events, browser or adapter rendering, and artifacts only when they help the operator understand that run.
_Avoid_: Clock shop, always-on dashboard wall

**Run Inbox**: The operator-facing queue of collection runs that need observation, review, retry, acknowledgement, or dismissal. It treats a run as work to triage and close, not as a passive row in a log table.
_Avoid_: Recent tasks table, static run history
