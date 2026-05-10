# Real Site Test Workflow

Use this flow to test Contextula against Seth-owned/personal websites or other safe targets.

## Recommended data home

Keep real test work outside the repo:

```bash
set CONTEXTULA_HOME=D:\contextula-data
```

or pass `--home <path>` on each command.

## Flow

```bash
contextula init
contextula demo site --name "Personal Site" --website "https://example.com"

# Or run the steps manually:
contextula intake customer --name "Personal Site" --website "https://example.com"
contextula status set <workspace> researching
contextula research <workspace> --max-pages 4
contextula agent packet <workspace>
contextula agent research <workspace>
contextula brief <workspace>
contextula design brief <workspace>
contextula design mock <workspace>
contextula preferences <workspace>
contextula tickets generate <workspace>
contextula draft outreach <workspace>
contextula dashboard <workspace>
contextula state <workspace>
contextula artifacts <workspace>
contextula portfolio
```

## Review loop

When a mock misses the mark:

```bash
contextula design critique <workspace> --feedback "Prefer brighter, more direct founder/operator energy."
contextula preferences <workspace>
contextula design revise <workspace>
```

## Guardrails

- Do not commit the data home.
- Treat generated mocks/drafts as internal unless approved.
- Capture feedback as claims/preferences so future iterations learn taste.
- Use `timeline` and `state` to inspect what happened before trusting generated artifacts.
