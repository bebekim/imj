# imj

A local CLI for managing music, interviews, and jokes URLs and playing them with `mpv`. Short for interviews, music, jokes.

## Requirements

- Node.js 24+
- npm
- [mpv](https://mpv.io/) — install with `brew install mpv`
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — install with `brew install yt-dlp` (needed for YouTube playlist expansion)
- [Ollama](https://ollama.com/) — install with `brew install ollama` (needed for LLM chat in playback console)

## Install

```bash
npm install -g github:bebekim/imj
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

# Add a single URL to staging (quotes needed for & in URLs)
imj add 'https://www.youtube.com/watch?v=...' --playlist "Late Night Jazz"

# Omit --playlist to stage into the default playlist
imj add 'https://www.youtube.com/watch?v=...'

# Add all videos from a YouTube playlist URL (requires yt-dlp)
imj add 'https://www.youtube.com/playlist?list=...'

# Validate staged URLs with mpv and import working ones into SQLite
imj import-staging

# List all playlists with song count and total play time
imj playlists

# Show songs in a playlist
imj show "Late Night Jazz"

# Export a playlist to an mpv playlist file
imj export study

# Play a playlist with the interactive playback console
imj play study
```

## Playback console

`imj play` launches an interactive console with keyboard shortcuts and an LLM-powered command mode.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Pause/resume |
| `n` | Next song |
| `b` | Previous song |
| `m` | Mute/unmute |
| `+` / `-` | Volume up/down |
| `Left` / `Right` | Seek ±10s |
| `l` | Like current song |
| `c` | Enter type mode (type commands or talk to the assistant) |
| `q` | Quit playback and exit |
| `Ctrl+C` | Force quit |

### Type mode

Press `c` to enter type mode, then type a command or natural language and press Enter. Press `Esc` to return to shortcut mode.

```
like              like the current song
liked             show liked songs in this playlist
vol 50            set volume to 50
seek 30           seek forward 30s
pause | next | prev | mute | status   direct controls
anything else → goes to the LLM as a chat message
```

Natural language input is sent to a local Ollama instance (`OLLAMA_HOST`, default `http://localhost:11434`; model `OLLAMA_MODEL`, default `gemma4:latest`). The LLM can control playback (pause, next, volume, seek, status), list playlists, show songs, and like songs via tool calls.

## How it works

1. **`add`** writes URLs to a staging file (`staging.tsv`), newest first. YouTube playlist URLs are expanded into individual video URLs using `yt-dlp`. Nothing goes into the database yet.
2. **`import-staging`** validates each staged URL by running `mpv --length=10` on it. Working URLs are imported into SQLite, broken ones stay in staging.
3. **`play`** exports the playlist to a file, spawns `mpv` as a child process with an IPC socket, and runs the interactive playback console with keybinds and LLM chat.

## Files

| Path | Purpose |
|---|---|
| `~/.config/imj/config.json` | Config (music dir, default playlist) |
| `~/Music/imj/imj.sqlite` | SQLite database (source of truth) |
| `~/Music/imj/staging.tsv` | Temporary staging file (URL + playlist, tab-separated) |
| `~/Music/imj/playlists/` | Exported mpv playlist files |

## Development

```bash
cd ~/repositories/individual/imj
npm install
npm test
npm run build
```

For fast iteration without rebuilding, run source directly with tsx:

```bash
npm start -- play study
```
