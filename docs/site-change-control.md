# Site Change Control

Contextula treats provider regeneration as a controlled change, not a blank-page rewrite.

When a user asks for site changes, the important product question is split into two lists before generation:

- **Must change** — the specific requested update or affected section.
- **Must preserve** — route paths, navigation labels, known active links, grounded facts, approved visual identity, critique-proven strengths, and any user-specified stability rules.

This prevents regen thrash: subtle unrelated changes to text bodies, button names, navigation, CTAs, or site structure that make AI-generated sites feel unstable.

## Command

```bash
npm run contextula -- site change <workspace-id> \
  --request "Link the active music app from Home and Projects." \
  --preserve "Keep existing nav labels, route paths, and unrelated body copy stable."
```

The command writes:

- `site/change-briefs/change_*.json`
- `site/change-briefs/change_*.md`
- a pending `site.change.review` approval
- a timeline event `site.change.briefed`

The latest change brief is included in `site packet` as `changeControl`, and the provider prompt instructs generators to obey it as the regeneration contract.

## Provider rule

If `changeControl` is present, providers should prefer the smallest coherent diff over full-site reinvention. If the requested change conflicts with `mustPreserve`, the provider should surface the conflict in approval notes instead of silently overriding stable context.
