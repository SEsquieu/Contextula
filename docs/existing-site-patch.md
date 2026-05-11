# Existing Site Patch Lane

`site patch` tracks and publishes changes made directly in an existing customer site repo without replacing the site with a generated build package.

This is useful when a human or implementation agent patches a hand-polished preview branch, but Contextula still needs to own the workflow record, checks, preview state, and production approval gate.

## Command

```bash
npm run contextula -- site patch <workspace-id> \
  --repo ../CustomerSite \
  --branch preview-branch \
  --request "Publish existing preview edits safely" \
  --preserve "Keep routes, nav labels, and known external links stable" \
  --url https://preview.example.com
```

## What it does

- Refuses protected production branches (`main`, `master`, `production`, `prod`).
- Switches to the preview branch only if the repo is clean.
- Optionally creates a `site.change.review` change brief.
- Snapshots text-like repo files into `site/patches/<patch>/snapshot.json`.
- Runs local HTML checks for viewport tags and broken local `href`/`src` references.
- Commits and pushes preview changes unless `--no-push` is supplied.
- Writes `site/patches/<patch>/manifest.json` and `report.md`.
- Creates a `site.production.review` approval gate.

## Why this exists

Generated builds are useful, but real customer sites often have hand-polished code, existing CMS output, or framework-specific structure. `site patch` lets Contextula supervise safe preview publication without forcing every iteration through a full-site generator.
