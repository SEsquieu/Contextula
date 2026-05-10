# Contextula

Contextula is a scoped-context operating layer for modernization loops.

It keeps customer/project context alive over time by combining bounded workspaces, append-only timelines, grounded memory claims, research snapshots, modernization plans, and approval-gated execution.

## What it is

- a persistent operational pipeline for modernization work
- a scoped-memory multi-agent system
- a human-supervised customer/project continuity platform
- a boring, inspectable file-first system before it becomes a service

## What it is not

- a fully autonomous sales AI
- a spam automation system
- a generic website builder
- a repo that stores customer operational data

## Architecture docs

- [Architecture](docs/architecture.md)
- [Storage Model](docs/storage.md)
- [Customer Ingestion](docs/ingestion.md)
- [Original modernization concept](ai-driven-modernization-pipeline.md)

## Storage split

The project repo contains the engine. Customer/project operational data lives in a separate data home:

```text
contextula/        # code/docs/templates
~/.contextula/     # workspaces, registry, timelines, claims, artifacts
```

Override with:

```bash
CONTEXTULA_HOME=D:\contextula-data
```

## MVP CLI

```bash
npm install
npm run contextula -- init
npm run contextula -- intake customer --name "Joe's Plumbing" --website "https://example.com"
npm run contextula -- research <workspace-id> --max-pages 4
npm run contextula -- portfolio
npm run contextula -- dashboard <workspace-id>
npm run contextula -- list
npm run contextula -- show <workspace-id>
npm run contextula -- approvals <workspace-id>
npm run contextula -- claims <workspace-id>
npm run contextula -- claim add <workspace-id> --text "Customer prefers phone calls." --confidence 0.7
npm run contextula -- report <workspace-id>
npm run contextula -- brief <workspace-id>
npm run contextula -- draft outreach <workspace-id>
npm run contextula -- tickets generate <workspace-id>
npm run contextula -- tickets list <workspace-id>
npm run contextula -- validate <workspace-id>
npm run contextula -- approve <workspace-id> <approval-id>
```

Run the smoke test with:

```bash
npm test
```

The intake command creates a clean customer workspace, captures a homepage research snapshot when a website is provided, derives initial claims, builds a profile, writes a modernization map, and creates a pending approval for any external outreach.

The `research` command can revisit an existing workspace and capture a small same-domain website snapshot without crossing the workspace boundary. `portfolio` writes a data-home-level portfolio report, while `dashboard` creates a static per-workspace HTML dashboard. The `claims` commands expose grounded workspace memory. The `brief` command turns the current profile and strongest claims into an internal modernization brief. The `draft outreach` command creates a draft artifact and a pending approval gate, but does not send anything. The `tickets` commands turn workspace context into small modernization tasks. The `validate` command checks the portable workspace contract before later agents depend on it.

## Design principle

Research should not merely answer “what does this business do?”

It should answer:

> what seems to matter to this business, what are they already trying to communicate, and where is their digital presence failing to support that?
