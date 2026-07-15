# Archive And Skip Playback Spec

Status: ready.

## Intent

A user listening to a playlist needs two fast actions:

- skip the current song without changing the playlist
- archive the current song so it stops playing now and is removed from that
  playlist for future `show`, `export`, and `play`

Archiving is playlist-scoped. A song archived from `study` may still exist in
another playlist.

## User Flow

While `imj play study` is running, the user hears an unwanted song.

For a one-time skip:

```bash
imj skip
```

For a permanent removal from that playlist:

```bash
imj archive-current
```

For cleanup outside playback:

```bash
imj archive study URL
```

## CLI Surface

```bash
imj skip
imj archive-current
imj archive PLAYLIST URL
```

Behavior:

- `imj skip` tells the active `mpv` session to move to the next playlist item.
- `imj archive-current` finds the active `mpv` session, reads the current URL,
  removes that song from the active playlist in SQLite, records an archive row,
  and tells `mpv` to stop playing that item immediately.
- `imj archive PLAYLIST URL` archives a known URL from a playlist without
  requiring playback to be running.
- `imj play NAME` should only include active playlist rows.
- `imj show NAME` and `imj export NAME` should only show/export active playlist
  rows.

If no player is running:

```text
No active imj playback session.
```

If the current URL is not in the active playlist:

```text
Current song is not in playlist 'study'.
```

## Architecture

Keep `mpv` as the player. Add only its local IPC socket for control commands.
Do not add a playback daemon or new dependency.

When `imj play NAME` starts `mpv`, pass an IPC socket:

```bash
mpv --no-video --loop-playlist=inf --input-ipc-server=<runtime-dir>/mpv.sock --playlist=<file>
```

Also write a small playback session file under the configured music directory:

```json
{
  "playlist": "study",
  "socket": "/path/to/mpv.sock",
  "started_at": "2026-07-15T00:00:00.000Z"
}
```

The session file is best-effort state. If the socket is missing or unusable,
commands should report no active playback and remove the stale session file.

## SQLite Changes

Do not delete from `songs`. Archive by moving the playlist membership out of the
active join table.

Add:

```sql
CREATE TABLE IF NOT EXISTS archived_playlist_songs (
  playlist_id integer not null references playlists(id),
  song_id integer not null references songs(id),
  archived_at text not null,
  primary key (playlist_id, song_id)
);
```

Archive flow:

1. Find `playlist_id` and `song_id`.
2. Insert or replace into `archived_playlist_songs`.
3. Delete the row from `playlist_songs`.

This keeps existing active playlist queries simple because archived songs are no
longer active playlist rows. Re-adding the same URL to the same playlist later
is allowed because the active membership row no longer exists.

## mpv IPC

Use JSON IPC over the socket.

Commands needed:

- get current URL:

```json
{"command":["get_property","path"]}
```

- skip current item:

```json
{"command":["playlist-next","force"]}
```

- remove current item after archive:

```json
{"command":["playlist-remove","current"]}
```

If `playlist-remove current` fails, fall back to `playlist-next force` so the
user is not stuck hearing the archived song.

## Interface Notes

`mpv` already supports keyboard skipping while it owns the terminal, but `imj
skip` exists so the action also works from another terminal, scripts, and future
bot interfaces.

`archive-current` is the important persistent action. It is the "I do not want
this in this playlist anymore" command.

## Acceptance Checks

- `imj play study` starts `mpv` with `--input-ipc-server`.
- `imj skip` sends `playlist-next force` to the active socket.
- `imj archive-current` reads the current URL from `mpv`, removes that URL from
  the active playlist in SQLite, records `archived_playlist_songs`, and removes
  or skips the current item in `mpv`.
- `imj archive PLAYLIST URL` removes that URL from only the named playlist.
- `imj show`, `imj export`, and future `imj play` calls do not include archived
  playlist memberships.
- Re-adding an archived URL to the same playlist creates a new active membership.
- A stale playback session file is ignored and cleaned up.

## Out Of Scope

- Global song deletion.
- Restore command.
- Ratings.
- A playback daemon.
- Rewriting a live `mpv` playlist for non-current archived songs.
