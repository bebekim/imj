# Archive And Skip Playback Spec

Status: ready.

## Intent

A user listening in `imj play NAME` needs keybinds inside the player:

- skip the current song
- go back to the previous song
- archive the current song so it stops playing now and is removed from that
  playlist for future `show`, `export`, and `play`

Archiving is playlist-scoped. A song archived from `study` may still exist in
another playlist.

## Playback Keybinds

`imj play NAME` should add these bindings for that mpv session:

| Key | Action |
| --- | --- |
| `n` | next song |
| `b` | previous song |
| `a` | archive current song from this playlist and skip it |

Keep mpv defaults too:

| Key | mpv default |
| --- | --- |
| `>` or `Enter` | next playlist item |
| `<` | previous playlist item |
| `p` or `Space` | pause/play |
| `m` | mute |
| `q` | quit |
| `?` | show active keybindings |

## User Flow

While `imj play study` is running:

- press `n` to skip a song once
- press `b` to go back
- press `a` when the song should be removed from `study`

After `a`, the current song should stop immediately and should not appear in
future `imj show study`, `imj export study`, or `imj play study` output.

For cleanup outside playback, keep a direct command:

```bash
imj archive PLAYLIST URL
```

## Architecture

Keep `mpv` as the player. Do not add a playback daemon or new dependency.

When `imj play NAME` starts `mpv`, load a small bundled Lua script and pass the
playlist name:

```bash
mpv --no-video --loop-playlist=inf \
  --script=<dist-or-src>/mpv/imj.lua \
  --script-opts=imj_playlist=NAME,imj_bin=<imj-bin-path> \
  --playlist=<generated-playlist-file>
```

The Lua script owns the live keybinds:

- `n`: `playlist-next force`
- `b`: `playlist-prev force`
- `a`:
  1. read mpv's current `path`
  2. run `imj archive NAME PATH`
  3. if archive succeeds, run `playlist-remove current`
  4. if removal fails, run `playlist-next force`

Use `mp.command_native_async` or `run` for the archive subprocess so playback
does not block on SQLite work.

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

This keeps active playlist queries simple because archived songs are no longer
active playlist rows. Re-adding the same URL to the same playlist later is
allowed because the active membership row no longer exists.

## Interface Rules

- The primary live interface is keybinds, not a second terminal command.
- `imj archive PLAYLIST URL` exists for the Lua script and for manual cleanup.
- If the archive command cannot find the URL in the playlist, show a short OSD
  message and leave playback alone.
- The Lua script should show short OSD messages:
  - `Archived`
  - `Archive failed`
  - `Not in playlist`

## Acceptance Checks

- `imj play study` starts `mpv` with the IMJ Lua script and playlist script opt.
- The Lua script binds `n` to `playlist-next force`.
- The Lua script binds `b` to `playlist-prev force`.
- The Lua script binds `a` to archive the current `path` from the active
  playlist and then remove or skip the current mpv playlist item.
- `imj archive PLAYLIST URL` removes that URL from only the named playlist.
- `imj show`, `imj export`, and future `imj play` calls do not include archived
  playlist memberships.
- Re-adding an archived URL to the same playlist creates a new active
  membership.

## Out Of Scope

- Global song deletion.
- Restore command.
- Ratings.
- A playback daemon.
- Rewriting a live `mpv` playlist for non-current archived songs.
