# Harness Doctor Report

Date: 2026-07-15

## Overall Readiness

Score: 3/5

This repo is a TypeScript Node CLI. The install and verifier path is npm-based:
no Python runtime or Python package manager is required.

## Runtime Requirements

- Node.js 24+
- npm
- `mpv` for URL validation and playback

## Useful Files Present

- `package.json`: package metadata, `imj` bin, npm scripts, and GitHub install
  build hook.
- `package-lock.json`: locked npm dependency graph.
- `tsconfig.json`: TypeScript compiler configuration.
- `src/`: CLI, config, database, staging, and playback code.
- `tests/`: Node test runner coverage.
- `AGENTS.md`: declares the intended local gates.
- `AGENT_LOOP.md`: Night Shift task-selection notes.

## Commands

- Install dependencies: `npm install`
- Test: `npm test`
- Build: `npm run build`
- Run from source: `npm start -- --help`
- Install globally from GitHub: `npm install -g github:bebekim/imj`

## Current Gaps

- No lint command is configured.
- No CI workflow is present.
- Playback behavior still depends on host `mpv` availability unless tests mock
  that boundary.
