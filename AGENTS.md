# Project Instructions for AI Agents

This workspace uses Lyo as the learning and session ledger. 

## Learning Ledger

- Let Lyo hooks record prompts, edits, commands, verifier failures, fixes, and
  outcomes.
- Use `.agent-learning/exercise.json` only for curriculum-style slices.
- Keep follow-up context in committed specs, plans, docs, or the handoff.

## Workflow

1. Clarify or select the work slice.
2. Write or update a spec when behavior changes.
3. Implement through tight verifier loops.
4. Run the verifier commands for the changed area.
5. Report failures, fixes, passing evidence, and remaining follow-up work.

## Session Completion

When ending a work session, complete the applicable steps:

1. Record remaining work in specs, docs, or the handoff.
2. Run quality gates if code changed.
3. Check Lyo context if this is an exercise workspace.
4. Commit and push completed work:

   ```bash
   git pull --rebase
   git push
   git status
   ```

Work is not complete until the push succeeds.

## Build And Test

Current intended local gates:

```bash
npm install
npm test
```

These may need adjustment while the project skeleton is still being wired.

