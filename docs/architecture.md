# Contextula Architecture

Contextula is a scoped-context operating layer for modernization loops. The repository contains the engine, schemas, templates, CLI, and tests. Operational customer/project data lives outside the repository in a Contextula data home.

## Product center

Contextula is not a generic website builder, autonomous sales bot, or spam automation system. It is a persistent, approval-gated operations system for modernization work.

The core promise:

> maintain durable, bounded, auditable continuity across many customer or project modernization loops.

## Core primitives

1. **Workspace** — a portable sandbox for one customer, prospect, or project.
2. **Timeline** — append-only event log; the operational source of truth.
3. **Claims** — grounded memory items derived from evidence, with confidence and source links.
4. **Artifacts** — drafts, screenshots, reports, plans, research, builds, approvals.
5. **Approval gates** — first-class records required before external or risky actions.
6. **Adapters** — boring execution edges: filesystem, web research, git, email, deployment, CRM, speech.

## Agent model

### Local workspace agent

Receives exactly one workspace root. It may read/write inside that root only.

Responsibilities:

- ingest source material
- summarize state
- derive/update claims
- generate drafts and plans
- request approval gates
- track unresolved questions

It may not:

- read sibling workspaces
- send external messages without approval
- deploy or bill without approval
- make commitments on behalf of a human

### Portfolio agent

Sees registry records, status summaries, metrics, and approval queues by default. It should not read full workspace contents unless explicitly authorized.

Responsibilities:

- surface stalled work
- prioritize pending approvals
- identify stale assumptions
- report portfolio health

### Execution adapters

Adapters perform concrete work under policy. The agent can request actions; adapters enforce boundaries.

Examples:

- filesystem adapter
- web research adapter
- repo/git adapter
- email/CRM adapter
- deployment adapter
- speech/call adapter

## Data flow

```text
intake
→ workspace creation
→ identity normalization
→ public/context research
→ source capture
→ claim extraction
→ profile build
→ modernization map
→ draft generation
→ approval request
→ approved execution
→ timeline update
→ repeat
```

## Trust boundaries

The following require explicit approval objects before execution:

- outreach/customer-facing messages
- proposal sends
- scope changes
- pricing
- deployment
- billing
- destructive edits
- anything public or externally visible

Agents may draft, recommend, summarize, and queue. Humans approve final action.

## Relationship to Atlas

Atlas focuses on physical-world perception/runtime loops. Contextula focuses on customer/project continuity loops. They share patterns — bounded memory, timeline events, approval gates, freshness/staleness — but remain logically separate.
