# Contributing to Sunpath

Sunpath is currently a proof of concept built and operated by a single person. These conventions exist so that *future-you* (and any contributors who join later) inherit a clean history.

## Branching

- `main` is always deployable. CI deploys it to `sunpath.dev` on every push.
- Feature branches: `feat/<short-name>`
- Fixes: `fix/<short-name>`
- Chores / config: `chore/<short-name>`
- Docs only: `docs/<short-name>`
- No long-lived `develop` branch.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(territory): add knock-score filter panel
fix(capture): retry failed bill OCR uploads
chore(deps): bump @supabase/supabase-js to 2.45.0
docs(readme): add getting-started section
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`.

Scopes match top-level modules: `core`, `territory`, `capture`, `ocr`, `doorcard`, `triggers`, `hoa`, `pipeline`, `sync`, `supabase`, `infra`.

## Pull requests

- Every change goes through a PR, **even solo work**. It forces a review beat and keeps `main` history clean via squash merge.
- CI must be green (lint + typecheck + tests + build) before merge.
- Squash-merge on close. The squash subject line should match the Conventional Commit format above.
- Reference issues with `Closes #123` so they auto-close on merge.

## Module isolation rule

Code inside `apps/web/src/modules/<X>/` may **only** import from:

- `@shared/*` (the `packages/shared` package)
- `@/lib/*` (cross-cutting utilities — supabase client, sync engine, map registry)
- `packages/ui` (shadcn components)
- Standard libraries

It may **not** import from `apps/web/src/modules/<Y>/` for any other `Y`. Cross-module communication happens through the database (rows, events, triggers) or through the layer/registry abstractions in `@/lib/`.

This rule is enforced by ESLint's `no-restricted-imports`. If you need to break it, that's a signal the design needs a new shared abstraction — open an issue first.

## Code style

- TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`).
- One concern per file; a 200-line component splits.
- Every source file starts with a one-sentence header comment: *what it does, which module owns it.*
- No barrel `index.ts` re-exports across modules — explicit imports only.
- Path aliases: `@/` → `apps/web/src/`, `@shared/` → `packages/shared/src/`.
- Validate every payload that crosses a network boundary with a zod schema in `packages/shared/src/schemas/`.

## Tests

- Vitest for unit tests. Co-locate `*.test.ts` next to source.
- Priority targets: `scoring.ts`, OCR parsers, the offline sync engine. UI fluff is a low priority.
- Playwright e2e arrives at Phase 2.
- New code that has obvious testable seams should ship with tests.

## Migrations

- Forward-only. **Never edit a committed migration** — add a new one.
- File naming: `supabase/migrations/<NNNN>_<short_description>.sql`.
- Migrations run in CI on push to `main` via the `Deploy Supabase` workflow.

## Secrets

- Never commit secrets. `.env.local` is gitignored.
- The `service_role` key never leaves Edge Functions or GitHub Actions Secrets — it must not appear in any file under `apps/web/`.
- Add new secrets to GitHub Actions → Settings → Secrets and variables → Actions, and document them in [docs/DESIGN.md](docs/DESIGN.md) §12.7.

## Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`. Tag with the module label (`territory`, `capture`, etc.) and the phase (`phase-0` … `phase-5`).
