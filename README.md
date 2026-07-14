# imj

A local CLI and Telegram Bot interface for managing music, interviews, and jokes URLs. Short for *interviews, music, jokes*.

---

> [!WARNING]
> **Disclaimer & Copyright Information (Hobbyist Use Only)**
> 
> * **Strictly a Personal Hobby Tool**: `imj` is designed solely as a personal developer experiment and utility. It is **not** licensed, built, or intended for commercial distribution, hosting, or public music streaming services.
> * **Terms of Service**: Direct extraction and background streaming of YouTube audio streams (using tools like `yt-dlp` and `ffmpeg`) may violate YouTube's Terms of Service. Use this software at your own risk.
> * **Copyright Compliance**: This software does not distribute copyrighted files, host media, or bypass Digital Rights Management (DRM). You are solely responsible for ensuring you have the legal rights to stream any URLs added to this manager. The authors of this software assume no liability for any misuse.

---

## Requirements

- **Node.js**: Version 20+
- **mpv**: Audio playback engine — install via `brew install mpv`
- **yt-dlp**: Required for Telegram downloader module — install via `brew install yt-dlp`
- **ffmpeg**: Required for audio transcoding — install via `brew install ffmpeg`

## Installation & Link

To compile and link the CLI globally on your machine:

```bash
npm run build
npm link
```

This puts the `imj` command on your system PATH.

## Setup

Initialize configuration:

```bash
imj setup --music-dir ~/Music/imj
```

This creates a config file at `~/.config/imj/config.json` and configures `~/Music/imj` for storage (SQLite database, staging file, exported playlists).

## Usage

### 1. CLI Commands
```bash
# Create a playlist
imj create "Late Night Jazz"

# Add a URL to staging (quotes recommended to escape '&' in URLs)
imj add 'https://www.youtube.com/watch?v=...' --playlist "Late Night Jazz"

# Validate staged URLs with mpv and import playable ones into SQLite
imj import-staging

# List all playlists
imj playlists

# Show songs in a playlist
imj show "Late Night Jazz"

# Play a playlist through local computer speakers (foreground)
imj play "Late Night Jazz"
```

### 2. Optional Telegram Bot Interface
You can run `imj` as an on-demand audio extractor that delivers `.mp3` tracks to your phone via Telegram (utilizing Telegram's native background media player):

```bash
imj bot-start --token "YOUR_TELEGRAM_BOT_TOKEN" --user-id YOUR_TELEGRAM_NUMERICAL_ID
```

#### Bot Commands:
*   `/playlists` — Lists your playlists.
*   `/show <name>` — Displays URLs in a playlist.
*   `/add <url> [--playlist <name>]` — Stages a URL from your phone.
*   `/import` — Validates and imports staged URLs into SQLite.
*   `/play <name>` — Downloads, transcodes, and uploads the tracks as standard `.mp3` bubbles to your chat.
*   *Note*: The bot immediately deletes the local server cache files after upload, and automatically purges its chat history after 24 hours.

## Development & Test

Run the test suite offline:

```bash
npm run build
npm test
```
