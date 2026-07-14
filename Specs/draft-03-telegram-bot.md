# imj Telegram Bot Spec

Status: draft, v1 design.

## Intent

Expose the `imj` media playlist manager through a secure Telegram Bot interface, enabling on-demand audio downloading, native mobile playback, and automated message/storage cleanup.

## System Dependencies

* **`yt-dlp`**: Must be installed on the host system to extract audio streams from URLs.
* **`ffmpeg`**: Must be installed on the host system to transcode audio streams into compressed `.mp3` or `.m4a` files.
* **`grammy`**: Node.js Telegram Bot framework package.

## CLI Surface

A new command to start the bot daemon:

```bash
imj bot-start --token <BOT_TOKEN> --user-id <TELEGRAM_USER_ID>
```

Options:
* `--token`: Your Telegram Bot API token (provided by @BotFather).
* `--user-id`: Your unique Telegram numerical User ID. Only messages from this ID will be processed.

---

## Telegram Chat Commands

All commands are secure and ignore requests from unauthorized users.

### `/playlists`
Lists all playlists stored in SQLite alphabetically.
* *Example Response*:
  ```text
  Your Playlists:
  • study
  • chill
  ```

### `/show <playlist_name>`
Lists the songs in the specified playlist.
* *Example Response*:
  ```text
  Playlist 'study':
  1. Lofi Beats (https://www.youtube.com/watch?v=...)
  2. Cafe Jazz (https://www.youtube.com/watch?v=...)
  ```

### `/add <url> [--playlist <name>]`
Normalizes and stages the URL. If the playlist option is omitted, stages to `default`.
* *Example Response*:
  ```text
  Staged 'https://www.youtube.com/watch?v=...' for playlist 'default'.
  ```

### `/import`
Triggers validation and SQLite import for all staged URLs.
* *Process*: Runs system validation checks.
* *Example Response*:
  ```text
  Validating staged links...
  OK: https://www.youtube.com/watch?v=... -> default
  Imported 1 link to SQLite.
  ```

### `/play <playlist_name>`
Downloads, transcodes, and delivers the tracks from the playlist.
* *Process*:
  1. Queries SQLite for URLs belonging to `<playlist_name>`.
  2. For each URL, downloads and encodes the audio to `/tmp/imj-cache/<song_id>.mp3` using `yt-dlp` and `ffmpeg`.
  3. Sends the audio files directly to the Telegram chat.
  4. Deletes the local `/tmp/imj-cache/<song_id>.mp3` file immediately after a successful upload.
  5. Saves the Telegram `message_id` and `chat_id` into the `sent_messages` database table to track them for deletion.

---

## Schema Additions

To handle the automatic message deletion, add the `sent_messages` table to [db.ts](file:///Users/marcus.kim/repositories/individual/imj/src/db.ts):

```sql
CREATE TABLE IF NOT EXISTS sent_messages (
  message_id integer not null,
  chat_id integer not null,
  sent_at text not null, -- ISO-8601 string, e.g. "2026-07-14T21:30:00.000Z"
  primary key (message_id, chat_id)
);
```

---

## Security & Whitelist Middleware

All incoming update payloads must pass through a strict ID whitelist check:

```typescript
bot.use((ctx, next) => {
  if (ctx.from?.id !== ALLOWED_USER_ID) {
    console.warn(`Blocked unauthorized access attempt from User ID: ${ctx.from?.id}`);
    return; // Ignore message entirely
  }
  return next();
});
```

---

## Automated 24-Hour Message Cleanup

To ensure chat messages do not persist, a background daemon will run an hourly cron loop:

1. Query SQLite:
   ```sql
   SELECT message_id, chat_id FROM sent_messages WHERE datetime(sent_at) < datetime('now', '-24 hours')
   ```
2. For each record, invoke the Telegram API delete call:
   ```typescript
   await bot.api.deleteMessage(chatId, messageId);
   ```
3. Remove the records from the `sent_messages` table after deletion.
