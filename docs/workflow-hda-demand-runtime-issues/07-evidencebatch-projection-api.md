# 07 — EvidenceBatch and projection API

Labels: ready-for-agent
Parent: docs/workflow-hda-demand-runtime-PRD.md

## What to build

Create the result-side projection APIs for EvidenceBatch, canonical evidence, clusters, conflicts, missing sources, source coverage, and answer summaries. Large collection outputs must be represented as batches and manifests, not as one frontend event per raw evidence item.

This slice should make the run useful to both frontend and AI consumers: they can ask what evidence arrived, which nodes produced it, which clusters changed, and what sources are still missing.

## Acceptance criteria

- [ ] Projection API exposes evidence batches by workflow run and node/source.
- [ ] Projection API exposes cluster/result summaries with evidence references.
- [ ] Projection preserves links to workflow run id, node id, source group, adapter task, trace id, and batch id.
- [ ] Large results are surfaced by manifest/count/reference, not raw per-record event spam.
- [ ] Tests cover batch projection, cluster projection, source coverage, missing sources, and AI-readable response shapes.

## Blocked by

- 05 — Multi Source OpenCLI HDA tracer
- 06 — Node run event stream
