# Contributing

Contextula is a best-effort reference implementation for bounded agent memory and approval-gated modernization workflows. Focused fixes, tests, documentation improvements, and narrowly scoped extensions are welcome.

## Project Boundaries

Changes should preserve these invariants:

- Customer and project workspaces remain isolated.
- Operational data stays outside the code repository.
- Timeline records remain append-only.
- Claims retain evidence, confidence, and source context.
- External communication, production publication, billing, pricing, and destructive work require explicit approval.
- Provider output is untrusted input and must be validated before durable writes or execution.
- Configured command adapters are explicit trusted edges; Contextula must not silently arm them.

Please open an issue before proposing a new platform surface or a broad architectural rewrite.

## Local Development

Requires Node.js 20 or newer.

```bash
npm install
npm test
```

For changes that touch browser rendering or visual snapshots, install the required Playwright browser and verify the affected flow locally.

Keep pull requests narrow. Explain the trust boundary affected by the change, tests performed, and any new data written to the Contextula data home.
