# Security Policy

## Supported Version

Security fixes are applied to the current `main` branch. Contextula does not currently publish versioned releases or operate a hosted service.

## Intended Security Boundary

Contextula is designed for a trusted local operator. It is not a hardened multi-tenant service or a sandbox for hostile input.

The repository contains the engine. Operational data—including customer context, screenshots, provider transcripts, approvals, drafts, secrets, and generated builds—belongs in a separate Contextula data home such as `~/.contextula/`.

Before using Contextula with real data:

- Keep `CONTEXTULA_HOME` outside the repository and outside any automatically synchronized public folder.
- Treat configured provider commands as arbitrary local code with the permissions of the current user.
- Treat target git repositories and preview branches as trusted execution edges.
- Review generated content and every pending approval before external publication or communication.
- Use only websites you are authorized to research and do not expose the CLI directly to untrusted users.
- Do not rely on approval records as an operating-system sandbox or access-control boundary.

Website research accepts operator-provided URLs and follows links on the same host. It is intended for local use against public, authorized targets; it should not be embedded in a network service without additional URL, redirect, DNS, response-size, and timeout controls.

## Sensitive Data

Never commit a Contextula data home, provider credentials, customer workspaces, private screenshots, or generated customer artifacts to this repository. The default `.gitignore` excludes common local data-home names, but filesystem placement and repository hygiene remain the operator's responsibility.

## Reporting a Vulnerability

Please do not disclose credentials, customer data, exploit details, or other sensitive information in a public issue.

Report security concerns privately through GitHub's security-advisory flow when available. Otherwise, contact the repository owner through the GitHub profile and include only enough information to establish a private reporting channel.
