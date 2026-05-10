# Customer Ingestion Design

First contact should feel like opening a clean case file.

```text
lead/contact arrives
→ create workspace
→ capture intake event
→ normalize identity
→ research public/context sources
→ build source snapshot
→ derive grounded claims
→ build profile
→ generate modernization opportunities
→ draft next action
→ request human approval before external contact
```

## Intake input

The first version accepts minimal manual input:

```bash
contextula intake customer --name "Joe's Plumbing" --website "https://example.com"
```

Future intake sources can include forms, CRM imports, emails, referrals, calls, or calendar notes.

## Workspace creation

The intake step creates a workspace immediately so every observation has a bounded home.

Initial durable artifacts:

- `workspace.json`
- `timeline.jsonl`
- `profile.json`
- `memory/claims.jsonl`
- `.contextula/policy.json`

First event:

```json
{"type":"customer.created","source":"manual","name":"Joe's Plumbing","website":"https://example.com"}
```

## Identity normalization

Before deeper research, Contextula attempts to normalize:

- business name
- canonical website
- category
- location/service area
- phone/email if public
- social/listing URLs if known
- duplicate ambiguity

If confidence is low, it creates a review item instead of pretending certainty.

## Research snapshot

Research captures raw evidence before interpretation.

Initial MVP sources:

- website homepage fetch
- page title/meta description
- headings
- visible links
- contact signals
- service keywords
- obvious CTAs

Future sources:

- crawl selected pages
- screenshots/mobile render
- Google Business/Profile data where permitted
- review summaries
- social profiles
- competitor/local context
- accessibility/performance checks

Research artifacts:

```text
research/sources.jsonl
research/extracted/homepage.md
research/observations.jsonl
```

## Claims

Raw sources become memory only through grounded claims.

Example:

```json
{
  "id": "claim_...",
  "text": "The site appears to prioritize phone calls as the primary conversion path.",
  "source": "research/extracted/homepage.md",
  "confidence": 0.72,
  "status": "active"
}
```

Claims should capture both facts and subtle operational guesses, while preserving uncertainty.

Subtleties to look for:

- what the business seems to value
- trust signals they already emphasize
- whether speed, price, locality, quality, or availability is the emotional hook
- mismatches between their apparent value and their digital presence
- outdated assumptions needing confirmation

## Profile

`profile.json` is current structured state derived from timeline + claims. It is not the source of truth; it is a convenience artifact.

## Initial modernization map

The first plan should rank small, shippable improvements by:

- evidence
- business value
- effort
- risk
- approval required

## Stop point

First-contact ingestion may create drafts and approval requests. It must not send outreach, publish content, change pricing, deploy, or contact a customer without an approved gate.
