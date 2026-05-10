# Storage Model

Contextula separates code from operational data.

## Repo vs data home

```text
contextula/                    # git repo: code, docs, schemas, templates, tests
  src/
  docs/
  package.json

~/.contextula/                 # default data home: operational state, not committed
  config.json
  registry.json
  workspaces/
  indexes/
  cache/
  secrets/
```

`CONTEXTULA_HOME` may override the data home:

```bash
CONTEXTULA_HOME=D:\contextula-data
```

## Why operational data must not live in the repo

Customer workspaces contain private context, screenshots, drafts, approvals, timelines, and potentially customer communications. They can grow large and must not bloat or contaminate the engine repository.

The repo contains **how Contextula works**. The data home contains **who Contextula is working for**.

## Registry

The data home has a registry of known workspaces:

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "cus_01JABC",
      "type": "customer",
      "slug": "joes-plumbing",
      "path": "workspaces/customers/cus_01JABC",
      "status": "active"
    }
  ]
}
```

IDs are stable. Slugs are human-friendly and may change.

## Customer workspace shape

```text
workspaces/customers/cus_01JABC/
  workspace.json
  profile.json
  timeline.jsonl
  memory/
    claims.jsonl
    summaries/
      current.md
  research/
    sources.jsonl
    extracted/
    snapshots/
  plans/
    initial-modernization-map.md
  drafts/
  approvals/
  reports/
  assets/
  builds/
  .contextula/
    policy.json
```

A workspace should be portable: zip the folder, move it, and the durable state remains readable.

## Durable vs rebuildable state

Durable truth:

- `timeline.jsonl`
- `workspace.json`
- `profile.json`
- `memory/claims.jsonl`
- artifacts, approvals, reports, drafts

Rebuildable cache:

- vector indexes
- extracted chunks
- temporary fetch cache
- generated previews

Indexes should live under the data home, not inside the repo:

```text
~/.contextula/indexes/cus_01JABC/
```

## Sandboxing rule

Agent/tool calls receive a workspace root, not the entire data home.

Good:

```ts
runWorkspaceAgent({ workspaceRoot: "~/.contextula/workspaces/customers/cus_01JABC" })
```

Bad:

```ts
runWorkspaceAgent({ dataRoot: "~/.contextula" })
```

The filesystem adapter must reject reads/writes outside the workspace root unless an elevated portfolio/admin policy is explicitly active.

## File format choices

- `.json` for current state/config
- `.jsonl` for append-only logs/events/claims
- `.md` for human-readable reports, summaries, plans, drafts
- `.sqlite` or vector DB files only for indexes/cache later

Boring formats win because the user should be able to inspect and recover a workspace without Contextula running.
