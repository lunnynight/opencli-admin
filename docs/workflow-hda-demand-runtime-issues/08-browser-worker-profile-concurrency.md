# 08 — Browser worker/profile concurrency

Labels: ready-for-agent
Parent: docs/workflow-hda-demand-runtime-PRD.md

## What to build

Add the high-concurrency browser execution model around Docker browser workers and profile/session coordination. Browser-heavy work should scale through multiple browser-worker containers per machine and multiple machines. Same-source multi-adapter work should share ProfileBinding and SessionSnapshot across containers while protecting profile mutations with ProfileLock.

This slice should focus on execution capacity and scheduling metadata, not rewriting OpenCLI collection behavior.

## Acceptance criteria

- [ ] Browser-worker capacity can be represented as container/worker slots independent of a single desktop Chrome.
- [ ] Multiple workers can register capacity for routing compiled OpenCLI tasks.
- [ ] ProfileBinding and SessionSnapshot are represented as runtime resources.
- [ ] Read-only tasks may share a snapshot; mutation tasks require exclusive ProfileLock.
- [ ] Tests cover worker registration/capacity view, snapshot sharing, mutation lock exclusion, and routing metadata for OpenCLI tasks.

## Blocked by

- 05 — Multi Source OpenCLI HDA tracer
