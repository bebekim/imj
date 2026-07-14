# Night Shift Agent Loop

## Operating Logic

Use the Tractatus-style proposition logic from
`~/repositories/.night-shift/HARNESS_PRINCIPLES.md` when available.

- Treat ready specs as the mission boundary.
- Preserve stated dependencies.
- Surface missing requirements instead of guessing product intent.
- Feed repeated corrections back into specs, docs, tests, or guardrails.

## Operating Rules

- Read `AGENTS.md` first.
- Do not work on specs whose filename starts with `draft-`.
- Work on one task at a time.
- Before implementation, write a short testing plan.
- Add or update tests before or alongside implementation.
- Run relevant tests.
- Run lint/typecheck/build commands when available.
- Commit each completed task separately.
- Record unrelated observations in `TODO.md`; do not opportunistically fix them.
- If blocked, write a concise note in `TODO.md` and move to another ready task.

## Task Selection

1. Start from the user's request when one is active.
2. Otherwise inspect `Specs/` and `TODO.md`.
3. Ignore files starting with `draft-`.
4. Pick the highest-priority ready spec, or the first ready spec if no priority
   is stated.
5. Complete it fully before starting another.

## Completion Report

When there are no ready tasks left, report:

- completed specs
- commits created
- tests run
- unresolved blockers
- follow-up TODOs

Then output:

```text
<promise>NIGHT_SHIFT_COMPLETE</promise>
```

