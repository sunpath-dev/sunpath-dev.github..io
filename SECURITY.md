# Security Policy

> **Status:** Sunpath is currently a proof of concept. It is not hardened for production use. Do not enter real homeowner data, real bill images, or real PII into a Sunpath instance until the production-hardening checklist in [plan.md](plan.md) is complete.

## Reporting a vulnerability

If you find a security issue:

1. **Do not** open a public GitHub issue.
2. Email the maintainer directly, or use GitHub's private security advisory feature: <https://github.com/sunpath-dev/sunpath-dev.github.io/security/advisories/new>.
3. Include enough detail to reproduce: affected versions, steps, expected vs. actual behavior, and any proof-of-concept payloads.

We aim to acknowledge reports within 7 days and resolve confirmed issues before the next release.

## Scope

Security reports are welcome on:

- The deployed app at <https://sunpath.dev>
- The source in this repository
- The Supabase schema and Edge Functions in `supabase/`
- Any GitHub Actions workflows

Out of scope (for now):

- Reports requiring physical access to a logged-in device
- Social-engineering attacks against the maintainer
- Denial-of-service from volume on a free-tier endpoint
- Reports against third-party services (Supabase, GitHub Pages, NREL, Census, etc.) — please report those directly to the relevant vendor

## Known limitations during POC

These are *expected* during the proof-of-concept and are not vulnerabilities to report:

- No column-level encryption on PII
- No data retention purge job
- No audit log of PII reads
- No rate limiting on Edge Functions
- No TOTP/WebAuthn (magic-link auth only)
- No DPIA on file
- Free-tier Supabase has limited backups

The pre-launch hardening list in [plan.md](plan.md) tracks every one of these.

## Disclosure

We follow coordinated disclosure: confirmed issues are fixed and deployed before details are made public. Reporters are credited (with permission) in release notes.
