# Async Import Staging Spec

Status: ready.

## Intent

`imj import-staging` should not block the user while every staged URL is
validated and imported. A playlist with dozens of staged songs should start a
background import job, return immediately, and allow normal commands such as
`imj play NAME` to run while validation continues.

This spec supersedes the synchronous `import-staging` behavior in
`Specs/01-cli.md`.

## User Problem

Today `import-staging` validates staged URLs one by one. If there are 38 songs,
the terminal is tied up until all 38 validations finish. Validation also must
not audibly play the song.

## CLI Surface

```bash
imj import-staging
imj import-staging --wait
imj import-status [job_id]
```

Behavior:

- `imj import-staging` snapshots current staged entries into a SQLite import
  job, starts a detached background worker, prints the job id, and exits.
- `imj import-staging --wait` runs the same job in the foreground and exits
  only after the job finishes. This keeps debugging and tests simple.
- `imj import-status` shows the latest import job when no id is provided.
- `imj import-status JOB_ID` shows that specific job.
- `imj play NAME` must not wait for import jobs.

Example:

```text
Started import job 12 with 38 staged entries.
Check progress with: imj import-status 12
```

Status output should be plain text:

```text
job 12 running: 9/38 done, imported 8, failed 1, skipped 0
```

## Architecture

Use SQLite as the job ledger. Do not add Redis, cron, a daemon supervisor, or a
new queue dependency.

Add tables:

```sql
CREATE TABLE IF NOT EXISTS import_jobs (
  id integer primary key,
  status text not null,
  total integer not null,
  imported integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  started_at text,
  finished_at text,
  created_at text not null
);

CREATE TABLE IF NOT EXISTS import_job_items (
  id integer primary key,
  job_id integer not null references import_jobs(id),
  url text not null,
  playlist text not null,
  status text not null,
  error text,
  created_at text not null,
  finished_at text
);
```

Allowed job statuses:

- `queued`
- `running`
- `completed`
- `failed`

Allowed item statuses:

- `pending`
- `imported`
- `failed`
- `skipped`

## Import Flow

1. `import-staging` reads `staging.tsv`.
2. If there are no staged entries, print `No staged entries to import.` and
   exit without creating a job.
3. If another job is `queued` or `running`, print that job id and exit without
   creating a duplicate job.
4. De-duplicate URL plus playlist pairs within the snapshot.
5. Insert one `import_jobs` row and one `import_job_items` row per unique staged
   entry.
6. Remove the queued entries from `staging.tsv` so repeated `import-staging`
   calls do not enqueue the same batch again.
7. Start a detached worker unless `--wait` was passed.
8. The worker processes pending items serially.
9. Working URLs are imported into SQLite and marked `imported`.
10. Existing URL plus playlist rows are marked `skipped`.
11. Failed URLs are marked `failed` and written back to `staging.tsv` so the user
    can retry or edit them.
12. The job moves to `completed` after every pending item reaches a terminal
    item status.
13. The job moves to `failed` only when the worker itself crashes or cannot open
    required files.

## Silent Validation

Validation should continue to use `mpv` because it verifies the same playback
path as `imj play`, but it must discard audio output.

Validation command shape:

```bash
mpv --no-video --ao=null --length=10 --really-quiet URL
```

Rules:

- Exit code `0` means the URL is valid.
- Non-zero exit code, timeout, or spawn error means validation failed.
- The validation timeout remains 20 seconds per URL.
- Validation must not use inherited stdio.
- Validation must not produce audible audio.

## Worker Process

The detached worker should reuse the CLI entrypoint through an internal hidden
command, for example:

```bash
imj import-worker JOB_ID
```

The hidden command is not part of the user-facing help. It exists so tests can
run the worker in-process or foreground without relying on process detachment.

## Concurrency

Only one import job may be `queued` or `running` at a time. The worker validates
items serially.

Parallel validation is out of scope. Add it later only if serial background
imports are still too slow.

## Acceptance Checks

- `imj import-staging` with staged entries creates an import job, removes those
  entries from staging, starts a background worker, and returns without running
  every validation in the foreground.
- `imj import-staging --wait` imports valid entries and re-stages failed entries
  before returning.
- `imj import-status` reports the latest job.
- `imj import-status JOB_ID` reports that job's counts and status.
- A second `imj import-staging` call while a job is active does not create a
  duplicate job.
- The validation command includes `--ao=null`, `--no-video`, and
  `--really-quiet`.
- `imj play NAME` can run while an import job is `queued` or `running`.

## Out Of Scope

- Parallel validation.
- A long-running daemon.
- A web UI.
- Job cancellation.
- Retry commands beyond failed URLs returning to `staging.tsv`.
