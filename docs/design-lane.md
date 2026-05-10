# Design Lane

Contextula should support agentic design work, but design must remain grounded in workspace evidence and approval history.

## Goal

Generate design briefs, mock directions, and iterated concepts from:

- public/business research
- grounded claims
- customer preferences
- brand/tone signals
- audience expectations
- prior approvals/rejections
- business goals

The goal is not generic AI design soup. The goal is context-grounded modernization design that gets better as the workspace learns customer taste.

## Workspace shape

```text
design/
  briefs/
  mocks/
  critiques/
  revisions/
  assets/
```

## Personality / taste model

Customer personality and brand taste should be represented as claims/preferences with sources and confidence.

Example:

```json
{
  "text": "Customer prefers plainspoken, practical copy over trendy startup language.",
  "source": "customer.reply.2026-05-10",
  "confidence": 0.9,
  "status": "active"
}
```

Research can infer tentative design signals, but direct customer feedback should have higher confidence.

## Artifacts

Initial design artifacts are file-first and human-readable:

- `design/briefs/design-brief.md`
- `design/mocks/homepage-v1.md`

Future artifacts may include:

- static HTML mock
- Tailwind mock
- screenshot/image mock
- Figma-style JSON
- deployable site draft

## Approval loop

Design is subjective. Generated mocks should be treated as review artifacts, not final customer-facing output.

Any external presentation, publication, or deployment requires approval.

Rejected designs should create memory, for example:

```json
{
  "text": "Customer disliked dark palette and preferred bright, practical service-business styling.",
  "source": "approval.rejected.design-v1",
  "confidence": 1,
  "status": "active"
}
```

This is how Contextula learns taste over time.
