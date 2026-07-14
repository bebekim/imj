# Harness Doctor Report

Date: 2026-07-14

## Overall Readiness

Score: 2/5

This repo is usable for a narrow Night Shift run because it has `AGENTS.md`,
`AGENT_LOOP.md`, Sandcastle entrypoints, a valid generic sandbox profile, and
clear ready-vs-draft spec naming. It is not yet reliable for unattended
preflight because the docs surface is mostly missing, local setup is not
documented for humans, only the pytest gate is explicit, and that gate is
currently failing.

## Files Checked

Useful files present:

- `AGENTS.md`: defines Lyo usage, workflow, session completion, and intended
  `uv sync` / `uv run pytest` gates.
- `AGENT_LOOP.md`: defines Night Shift task selection and excludes `draft-*`
  specs.
- `.sandcastle/implement-night-shift.md`: useful Night Shift runner prompt.
- `.sandcastle/preflight-specs.md`: useful spec preflight prompt.
- `.sandcastle/sandbox.json`: valid `generic` profile with `uv sync` setup and
  `uv run pytest` checks.
- `Specs/README.md`: explains ready-vs-draft routing.
- `Specs/01-cli.md`: implementation-ready v0 CLI spec with acceptance checks.
- `Specs/draft-02-llm-enrichment.md`: correctly marked draft/out-of-scope.
- `pyproject.toml`: declares package metadata, `click`, `pytest`, and
  `imj` console script.

Expected files missing:

- `docs/README.md`
- `docs/testing.md`
- `docs/architecture.md`
- `docs/domain.md`
- `docs/style-guide.md`
- `docs/common-pitfalls.md`
- `TODO.md`
- `CHANGELOG.md`
- `Specs/preflight-report.md`

Not present and probably not needed yet:

- `.env.example`: v0 does not appear to require credentials or env vars beyond
  standard `XDG_CONFIG_HOME` test isolation.
- Lyo exercise manifest: `.agent-learning/exercise.json` is absent; this does
  not look like a curriculum-style workspace.
- CI files: no `.github/` workflows are present.

Unavailable external harness references:

- `~/repositories/.night-shift/HARNESS_PRINCIPLES.md`
- `~/repositories/.night-shift/SANDCASTLE.md`
- `~/repositories/.night-shift/SPEC_PREFLIGHT.md`

## Stale Or Placeholder Files

- `README.md` exists but is empty.
- `.sandcastle/doctor.md` is a prompt copy, not a prior doctor result. The
  canonical report now lives here.

## Missing Commands

Explicit:

- Setup: `uv sync`
- Test: `uv run pytest`

Missing or undocumented:

- Lint command
- Typecheck command
- Build command in project docs or sandbox config; `uv build` works when tested
  manually.

If the project intentionally has no lint/typecheck yet, say that in
`docs/testing.md` and `.sandcastle/sandbox.json` instead of leaving agents to
guess.

## Missing Environment And Setup Notes

- No human setup instructions in `README.md`.
- No documented system dependency for `mpv`, even though the ready spec makes
  it part of runtime behavior.
- No note that SQLite comes from Python stdlib and does not need a service.
- No note that tests should isolate config/data with `XDG_CONFIG_HOME`.
- `.sandcastle/sandbox.json` has empty `serviceNotes`, which is correct for
  database services, but should mention the host/system `mpv` dependency if
  Night Shift is expected to run playback-related checks.

## Spec Readiness Concerns

- Ready specs and draft specs are distinguishable: `draft-*` files are ignored
  by Night Shift, and `Specs/README.md` says non-draft specs are active after
  preflight.
- `Specs/01-cli.md` is reasonably testable and has acceptance checks.
- `Specs/draft-02-llm-enrichment.md` is correctly out of scope.
- There is no `Specs/preflight-report.md`, so prior preflight state is absent.
- The ready spec depends on `mpv`; tests can mock subprocess calls, but any
  real playback verifier needs documented availability or an explicit skip.

## Verifier Evidence

- `uv sync`: passed.
- `uv run imj --help`: passed.
- `uv build --out-dir /tmp/imj-build`: passed.
- `git diff --check`: passed before this report update.
- `uv run pytest`: failed, 7 failed and 31 passed.

Pytest failures are concentrated in playback/import behavior:

- `tests/test_player.py::test_validate_url_success`
- `tests/test_cli.py::test_import_staging_validates_and_imports`
- `tests/test_cli.py::test_import_staging_flushes_imported_leaves_failed`
- `tests/test_cli.py::test_import_staging_skips_duplicates`
- `tests/test_cli.py::test_import_staging_empty`
- `tests/test_cli.py::test_play_command_invokes_mpv`
- `tests/test_cli.py::test_play_empty_playlist`

The common harness concern is `mpv` availability. Current code checks
`shutil.which("mpv")` before mocked subprocess calls, so a sandbox without
`mpv` installed fails the declared gate.

## Recommended Next Edits

1. Fill `README.md` with project purpose, install/setup, runtime dependency
   notes, and core commands.
2. Add `docs/testing.md` with exact setup, test, lint, typecheck, and build
   commands; explicitly mark missing gates as not configured.
3. Add `docs/domain.md` for playlists, staging, SQLite source of truth, and
   `mpv` validation semantics.
4. Add `docs/architecture.md` with the CLI/package/module overview.
5. Add `TODO.md` for blocked or unrelated Night Shift observations.
6. Add `CHANGELOG.md` if agents are expected to record behavior changes.
7. Run spec preflight once and write `Specs/preflight-report.md`.
8. Decide whether tests require real `mpv`, a test double, or a documented
   sandbox package dependency.

## Suggested Mechanical Checks To Add

- Add lint once a formatter/linter is chosen, for example `uv run ruff check .`.
- Add typecheck only if the project commits to annotations, for example
  `uv run mypy imj`.
- Add build verification, for example `uv build`.
- Add a CLI smoke check such as `uv run imj --help`.
- Mirror the final chosen gates in `.sandcastle/sandbox.json` after pytest is
  stable in the sandbox.
