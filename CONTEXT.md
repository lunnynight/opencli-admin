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

### Control

**Advisory Mode**: The control-loop operating mode in which suggested actions are surfaced to the operator and recorded as evidence, but never executed.
_Avoid_: dry-run mode, suggestion mode

**Automatic Mode**: The control-loop operating mode in which the Actuator may execute suggestions itself, opened per state class only when accumulated evidence justifies it.
_Avoid_: autopilot, self-healing mode

**Actuator**: The component that carries out control actions against the collection system. It executes only whitelisted safe actions; everything else it downgrades.
_Avoid_: executor, auto-fixer

**Evidence Ledger**: The durable record of every control suggestion and execution, together with the outcome later judged from post-decision measurements.
_Avoid_: action log, audit trail

**Recovery Rate**: The share of judged suggestions whose triggering state later cleared. It is the quantified basis for opening Automatic Mode.
_Avoid_: success rate, fix rate

**Require-Review Downgrade**: The policy that suggestions too dangerous to automate are executed only as "flag the source for human review", never as the suggested action itself.
_Avoid_: blocked action, action rejection

**Control Cycle**: The background loop that periodically measures every source, decides, and — in Automatic Mode — acts. It runs regardless of whether any UI is open.
_Avoid_: polling-driven control, frontend-triggered control
