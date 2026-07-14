# Spec Preflight Report

Date: 2026-07-14

## Summary

- `Specs/01-cli.md` is already implemented and covered by the current test suite.
- `Specs/draft-02-llm-enrichment.md` is correctly a draft and is not safe for Night Shift.
- `Specs/README.md` correctly routes Night Shift away from `draft-*` files.
- No `docs/` Markdown files were present.
- `~/repositories/.night-shift/SPEC_PREFLIGHT.md` and `HARNESS_PRINCIPLES.md` were not available.

Verifier evidence:

```bash
uv sync
uv run pytest
```

Result: `38 passed`.

## Specs Reviewed

- `Specs/README.md`
- `Specs/01-cli.md`
- `Specs/draft-02-llm-enrichment.md`

## Readiness Table

| Spec | State | Why |
| --- | --- | --- |
| `Specs/README.md` | done | Routing doc only. It says active specs are non-draft Markdown files after preflight, and matches `AGENT_LOOP.md`. |
| `Specs/01-cli.md` | done | v0 CLI behavior is implemented in `imj/`, acceptance checks exist in `tests/`, and `uv run pytest` passes. |
| `Specs/draft-02-llm-enrichment.md` | draft | The filename starts with `draft-`, the content says v1 draft/out of scope for v0, and it has unresolved provider, credential, behavior, and failure-mode questions. |

## Dependency Graph

```text
Specs/README.md
  -> Specs/01-cli.md
  -> Specs/draft-02-llm-enrichment.md

Specs/draft-02-llm-enrichment.md
  -> Specs/01-cli.md (requires songs already stored in SQLite)
  -> external LLM/Needle provider decision
  -> API credential configuration decision
```

## Clarification Questions

For `Specs/draft-02-llm-enrichment.md`:

1. Which provider and model should Needle use?
2. How should API credentials be configured: environment variable, config file, keychain, or provider-specific default?
3. Should enrichment inspect only the URL string, fetch page metadata, call an external tool, or use a mix?
4. When one URL fails enrichment, should the command continue with the rest of the playlist?
5. Should partial enrichment results be saved when some fields are missing?
6. What exact acceptance checks should prove `enrich` and `enrich-url` work without live external credentials?
7. Should v1 include inferred playback such as `imj play radiohead`, or remain metadata-only?

## Missing Inputs And Guardrails

- No test fixture or mock contract is defined for Needle/provider responses.
- No environment variable names are defined for API credentials.
- No offline acceptance path is defined for enrichment.
- No migration plan is defined for adding enrichment fields beyond the existing `songs.title`.
- The top-level `README.md` is empty, so user-facing install/test/run guidance lives only in specs and project metadata.

## Recommended Doc Updates

- Add a short top-level `README.md` with the supported local commands: `uv sync`, `uv run pytest`, and basic `imj` usage.
- In the LLM enrichment spec, define the credential source, provider/model, response fixture format, database field changes, and offline tests before removing `draft-`.
- If enrichment needs new columns, add a migration note or schema-update acceptance check to the spec.

## Recommended Filename Changes

- Keep `Specs/draft-02-llm-enrichment.md` as-is until the clarification questions above are answered and acceptance checks are added.
- No rename is needed for `Specs/01-cli.md`; it is complete, but a future cleanup may move it to a completed-spec archive if this repo adopts one.

## Specs Safe For Night Shift

None.

`Specs/01-cli.md` is already done. `Specs/draft-02-llm-enrichment.md` is a draft and must remain excluded.
