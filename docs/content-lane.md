# Content Lane

Contextula can generate content while preserving customer context.

The content lane keeps generated writing separate from site regeneration:

- **Workspace memory** provides claims, classification, tone, preferences, and known constraints.
- **Content drafts** are durable artifacts under `content/drafts/`.
- **Publishing approval** is explicit via `content.publish.review`.
- **Site wiring** happens later through `site change`, so approved content can be added without unrelated regen drift.

## Commands

```bash
npm run contextula -- content draft <workspace-id> --topic "Why this project hub exists" --type blog-post
npm run contextula -- content list <workspace-id>
```

A content draft writes:

- `content/drafts/<slug>-content_*.md`
- `content/drafts/<slug>-content_*.json`
- a pending approval gate
- a `content.drafted` timeline event

Drafts include editorial guardrails and grounding claims. They should not invent dates, metrics, testimonials, credentials, launch claims, or integrations. Human approval is required before publishing or wiring into a site.

## Intended flow

1. Draft content from grounded context.
2. Review/edit/approve the content artifact.
3. Use `site change` to publish approved content into Notes, Blog, or another content index.
4. Run `site generate`, `site critique`, and `site preview`.

This lets Contextula add content while keeping the customer's context stable and auditable.
