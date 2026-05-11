# Preview Loop

Contextula's customer-facing loop should end at a reviewable preview, not at raw internal artifacts.

The preferred flow is:

1. Capture the requested change as change-control when needed.
2. Build or provider-generate a site package.
3. Run critique gates for the selected viewport.
4. Publish to a non-production preview branch.
5. Create a production approval gate.

## Command

```bash
npm run contextula -- site loop <workspace-id> \
  --repo ../CustomerSite \
  --branch preview-branch \
  --request "Publish approved note to the Notes lane" \
  --viewport mobile \
  --url https://preview.example.com
```

By default `site loop` uses the static site builder. Use a provider when a regenerated package is desired:

```bash
npm run contextula -- site loop <workspace-id> \
  --repo ../CustomerSite \
  --branch preview-branch \
  --provider openclaw \
  --request "Update the homepage hero while preserving nav labels"
```

For fixture/testing flows:

```bash
npm run contextula -- site loop <workspace-id> \
  --repo ../CustomerSite \
  --branch preview-branch \
  --provider json \
  --response docs/fixtures/site-generate-response-good.json \
  --no-push
```

## Why this exists

Raw artifacts are useful for audit, but customer UX should resolve to a concrete preview URL and a clear approval gate for production. This keeps the user out of the machinery unless they want to inspect it.
