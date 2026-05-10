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
- [Agent Provider Contract](docs/agent-provider-contract.md)
- [Design Lane](docs/design-lane.md)
- [Real Site Test Workflow](docs/real-site-test-workflow.md)
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
npm run contextula -- demo site --name "Joe's Plumbing" --website "joesplumbing.example" --max-pages 4
npm run contextula -- intake customer --name "Joe's Plumbing" --website "https://example.com"
npm run contextula -- research <workspace-id> --max-pages 4
npm run contextula -- agent providers
npm run contextula -- agent packet <workspace-id>
npm run contextula -- agent prompt <workspace-id>
npm run contextula -- agent research <workspace-id>
npm run contextula -- portfolio
npm run contextula -- dashboard <workspace-id>
npm run contextula -- state <workspace-id>
npm run contextula -- timeline <workspace-id>
npm run contextula -- status <workspace-id>
npm run contextula -- status set <workspace-id> researching
npm run contextula -- preferences <workspace-id>
npm run contextula -- artifacts <workspace-id>
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
npm run contextula -- design packet <workspace-id>
npm run contextula -- design prompt <workspace-id>
npm run contextula -- design brief <workspace-id>
npm run contextula -- design mock <workspace-id>
npm run contextula -- design html <workspace-id>
npm run contextula -- design html <workspace-id> --provider json --response docs/fixtures/design-html-response-good.json
npm run contextula -- visual snapshot <workspace-id>
npm run contextula -- visual snapshot <workspace-id> --artifact design/mocks/homepage-v1.html
npm run contextula -- review <workspace-id>
npm run contextula -- design critique <workspace-id> --feedback "Prefer brighter, more practical styling."
npm run contextula -- design revise <workspace-id>
npm run contextula -- validate <workspace-id>
npm run contextula -- approve <workspace-id> <approval-id>
```

Run the smoke test with:

```bash
npm test
```

The intake command creates a clean customer workspace, captures a homepage research snapshot when a website is provided, derives initial claims, builds a profile, writes a modernization map, and creates a pending approval for any external outreach. `demo site` runs the safe internal loop end-to-end and prints the important artifacts. It does not send messages or perform external writes beyond read-only website fetches.

The `research` command can revisit an existing workspace and capture a small same-domain website snapshot without crossing the workspace boundary. `agent providers` reports configured research and design providers. `agent packet` exports the bounded research packet for external brains. `agent prompt` exports a semantic research prompt around that packet. `agent research` is the first brains socket: it runs a bounded research provider against a prepared workspace packet, archives the provider run under `research/provider-runs/`, and writes observations, claims, and an agent research brief. `portfolio` writes a data-home-level portfolio report, while `dashboard` creates a static per-workspace HTML dashboard. `state` materializes a compact workspace state summary, and `timeline` inspects the append-only event stream. The `claims` commands expose grounded workspace memory. The `brief` command turns the current profile and strongest claims into an internal modernization brief. The `draft outreach` command creates a draft artifact and a pending approval gate, but does not send anything. The `tickets` commands turn workspace context into small modernization tasks. The `design` commands generate context-grounded briefs and first-pass markdown mocks based on claims, brand/taste signals, and approval-aware constraints. `design packet` and `design prompt` build the full semantic+visual context packet for model-backed design generation, while `design html --provider json|openclaw` archives design provider runs under `design/provider-runs/`. Design mocks create pending `design.review` approval gates. `visual snapshot` renders the live site or generated HTML artifact with Playwright and stores screenshots, DOM text, metadata, and a visual-analysis prompt under `visual/snapshots/`. Design critique records taste feedback as durable claims, and design revise uses that feedback to create a revised mock. `preferences` materializes taste/personality signals into `memory/preferences.json`. The `validate` command checks the portable workspace contract before later agents depend on it.

OpenClaw provider handoff is configured with:

```bash
CONTEXTULA_OPENCLAW_RESEARCH_COMMAND="your-command-that-reads-stdin-and-writes-json"
npm run contextula -- agent research <workspace-id> --provider openclaw
```

Model-backed design uses the same pattern:

```bash
CONTEXTULA_OPENCLAW_DESIGN_COMMAND="your-command-that-reads-stdin-and-writes-design-json"
npm run contextula -- design html <workspace-id> --provider openclaw --variant model-v1
```

## Design principle

Research should not merely answer “what does this business do?”

It should answer:

> what seems to matter to this business, what are they already trying to communicate, and where is their digital presence failing to support that?
