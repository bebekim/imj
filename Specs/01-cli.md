# imj Python CLI Spec

Status: v0 complete.

Verified: `uv sync` and `uv run pytest` pass on 2026-07-14.

## Source Inputs

- Current project idea: local Python CLI for managing music URLs and playing them with `mpv`.
- Template repo: `/Users/marcus.kim/repositories/oss/pgcli`.
  - The originally mentioned path, `/Users/marcus.kim/repositries/oss/pgcli`, does not exist.
- Existing manual playback command:

```bash
mpv --no-video --loop-playlist=inf --playlist=/Users/marcus.kim/Music/playlist.txt
```

## Confirmed v0 Product Intent

- The CLI command name is `imj`.
- User can add music URLs from the CLI.
- User can create named playlists.
- SQLite is part of v0 and is the source of truth.
- A global text staging file exists as temporary input into SQLite.
- New staging entries are prepended to the top of the file, not appended to the bottom.
- The staging file is append-only in behavior, except that it may be flushed after successful SQLite import.
- A song can belong to multiple playlists.
- `mpv` is assumed to already be installed for v0.
- If `mpv` is missing, the CLI should fail with an error saying `mpv` needs to be installed or upgraded.
- LLM enrichment is not part of v0. See `Specs/draft-02-llm-enrichment.md`.
- Dependency management uses `uv`.
- SQLite does not need a separate install for v0; Python's stdlib `sqlite3` creates and uses the database file.

## pgcli Template Requirements

Use pgcli as a Python CLI implementation template, not as a feature template.

- Use a real package layout, not only a top-level `main.py`.
  - Target shape: `imj/main.py`, `imj/__main__.py`, `tests/`.
- Use a console script entry point in `pyproject.toml`.
  - `imj = "imj.main:cli"`
- Use `click` for command parsing.
- Add dependencies through `uv` and keep them in `pyproject.toml`.
- Keep command behavior testable with `click.testing.CliRunner`.
- Use an XDG-aware config directory, following pgcli's `~/.config/<app>/` pattern.
- Allow test isolation through `XDG_CONFIG_HOME`.
- Keep local defaults overridable by explicit CLI flags or environment variables.

## v0 CLI Surface

```bash
imj setup [--music-dir PATH]
imj create NAME
imj add URL [--playlist NAME]
imj import-staging
imj playlists
imj show NAME
imj export NAME [--output PATH]
imj play NAME
```

Default playlist behavior:

- The default playlist is named `default`.
- If `--playlist` is omitted on `add`, use `default`.
- If the target playlist does not exist, v0 creates it automatically.
- `add` writes to the staging file only. It does not write directly to SQLite.

`import-staging` validates staged entries with `mpv`, imports only non-duplicate working URLs into SQLite, and then flushes imported entries from staging.

## Setup And Paths

Config should follow pgcli's XDG-style pattern:

- Config directory: `~/.config/imj/`, or `$XDG_CONFIG_HOME/imj/` when set.
- Config file stores at least:
  - music directory
  - default playlist name

Data should live under the configured music directory.

- Default music directory: `~/Music/imj`.
- The parent location is `~/Music` for now.
- The directory can be changed later through setup/config.
- `playlist.txt` is only the current manual example, not a fixed required path.
- SQLite database path: `~/Music/imj/imj.sqlite`.
- Staging file path: `~/Music/imj/staging.tsv`.
- Exported playlist files live under `~/Music/imj/playlists/` and are overwritten in place.

## Staging File

The staging file is a global temporary text file, not one file per playlist.

Conceptual content:

```text
URL4	playlist3
URL3	playlist1
URL2	playlist2
URL1	playlist1
```

Behavior:

- Each new entry is inserted at the top.
- Each entry records at least URL and playlist name.
- Entries are tab-separated: `URL<TAB>playlist_name`.
- The staging file may be manually edited.
- Blank lines are ignored.
- Comment lines beginning with `#` are ignored.
- Playlist names may contain spaces because the delimiter is a tab.
- Duplicate URL plus playlist entries are ignored during import.
- Working, non-duplicate entries are flushed from staging after successful import.
- Broken entries stay in staging so the user can inspect or remove them.

## SQLite Schema

Use separate songs and playlists tables.

Minimum v0 schema:

```sql
songs(
  id integer primary key,
  url text not null unique,
  title text
)

playlists(
  id integer primary key,
  name text not null unique,
  slug text not null unique
)

playlist_songs(
  playlist_id integer not null references playlists(id),
  song_id integer not null references songs(id),
  position integer,
  primary key (playlist_id, song_id)
)

play_history(
  id integer primary key,
  song_id integer not null references songs(id),
  played_at text not null
)
```

Notes:

- `title` may be empty in v0.
- `slug` is the filesystem-safe playlist name, e.g. `Late Night Jazz` becomes `late-night-jazz`.
- The same URL should not be stored in the same playlist more than once.
- `position` preserves insertion order in the playlist.
- `play_history` is included in v0 schema but does not need to be populated until playback tracking is implemented.

## Export And Playback

`imj play NAME` is a wrapper around `mpv`.

Playback means the CLI starts `mpv` to play either one URL for validation or a generated playlist for normal listening.

v0 assumptions:

- `mpv` is already installed.
- The CLI does not install `mpv`.
- If `mpv` is missing, print an error saying `mpv` needs to be installed or upgraded.
- Normal playlist playback runs in the foreground and blocks the terminal until `mpv` exits.
- The default playback behavior is equivalent to:

```bash
mpv --no-video --loop-playlist=inf --playlist=<generated-playlist-file>
```

Validation behavior:

- Before a staged URL is committed to SQLite, `import-staging` must validate that the URL plays at least once through `mpv`.
- Import only URLs whose validation exits successfully.
- Validation uses a short foreground `mpv` run without playlist looping.
- Validation command shape:

```bash
mpv --no-video --length=10 URL
```

- Treat exit code `0` as working.
- Treat any non-zero exit code or timeout as failed validation.
- Use a 20 second process timeout for validation.
- Do not print the `mpv` command before normal playback unless there is an error.
- No dry-run mode is required for v0.

## Explicitly Out Of Scope For v0

- LLM enrichment.
- Searching by inferred artist or theme, such as `imj play radiohead`.
- Automatic `mpv` installation.
- Cross-platform package-manager support.

## v0 Acceptance Checks

- `imj --help` shows available commands.
- `imj setup --music-dir PATH` writes config without touching real user files in tests.
- `imj create study` creates a playlist row.
- `imj add URL --playlist study` writes a newest-first staging entry.
- `imj import-staging` validates staged entries with `mpv`.
- `imj import-staging` imports only non-duplicate working URLs into SQLite.
- `imj import-staging` flushes imported entries from staging and leaves failed entries in place.
- `imj show study` prints URLs and any available titles.
- `imj export study` writes an `mpv` playlist file.
- `imj play study` invokes `mpv` with no video and infinite playlist loop.
- Tests use temporary config/data directories.
