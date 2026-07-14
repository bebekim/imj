# imj

A local CLI for managing music, interviews, and jokes URLs and playing them with `mpv`. Short for interviews, music, jokes.

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- [mpv](https://mpv.io/) — install with `brew install mpv`

## Install

```bash
uv tool install ~/repositories/individual/qnp-music
```

This puts the `imj` command on your PATH.

## Setup

```bash
imj setup --music-dir ~/Music/imj
```

Creates config at `~/.config/imj/config.json` and uses `~/Music/imj` for data (SQLite DB, staging file, exported playlists).

## Usage

```bash
# Create a playlist
imj create "Late Night Jazz"

# Add a URL to staging (quotes needed for & in URLs)
imj add 'https://www.youtube.com/watch?v=...' --playlist "Late Night Jazz"

# Omit --playlist to stage into the default playlist
imj add 'https://www.youtube.com/watch?v=...'

# Validate staged URLs with mpv and import working ones into SQLite
imj import-staging

# List all playlists
imj playlists

# Show songs in a playlist
imj show "Late Night Jazz"

# Export a playlist to an mpv playlist file
imj export study

# Play a playlist (foreground, blocks until you quit mpv)
imj play study
```

## How it works

1. **`add`** writes URLs to a staging file (`staging.tsv`), newest first. Nothing goes into the database yet.
2. **`import-staging`** validates each staged URL by running `mpv --length=10` on it. Working URLs are imported into SQLite, broken ones stay in staging.
3. **`play`** exports the playlist to a temporary file and launches `mpv --no-video --loop-playlist=inf` in the foreground.

## Files

| Path | Purpose |
|---|---|
| `~/.config/imj/config.json` | Config (music dir, default playlist) |
| `~/Music/imj/imj.sqlite` | SQLite database (source of truth) |
| `~/Music/imj/staging.tsv` | Temporary staging file (URL + playlist, tab-separated) |
| `~/Music/imj/playlists/` | Exported mpv playlist files |

## Development

```bash
cd ~/repositories/individual/qnp-music
uv sync
uv run pytest
```
