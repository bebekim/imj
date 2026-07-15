import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as config from './config.js';
import * as db from './db.js';
import { player } from './player.js';
import { connectMpv, waitForSocket, socketPath, type MpvClient } from './mpv-ipc.js';
import { chat, type ChatMessage, type LlmContext } from './llm.js';

// ---------------------------------------------------------------------------
// Playback console — single raw-mode session for the whole playback
//
// Shortcut mode (default):
//   space   pause/resume      n   next song         p   prev song
//   m       toggle mute       q   quit playback
//   + / -   volume up/down    ←/→ seek ±10s
//   l       like current song
//   a       add a song (enter add mode — type URL, press Enter)
//   c       enter type mode
//
// Type mode (press c, Esc to exit):
//   Type commands or natural language, press Enter to send.
//   add <url>         add a song to the current playlist (validated async, queued live)
//   like              like current song
//   liked             show liked songs in this playlist
//   vol 50            set volume to 50
//   seek 30           seek forward 30s
//   pause | next | prev | mute | status   direct controls
//   anything else → goes to the LLM
// ---------------------------------------------------------------------------

const HELP = `
Playback console — '${'playlist'}'
  Shortcuts: space pause | n next | p prev | m mute | l like | a add | q quit
  Press c to type a command or talk to the assistant (Esc to return)
    add <url>  add a song to this playlist (validated, queued without stopping playback)
`;

export async function playbackConsole(playlistName: string): Promise<void> {
  const { stdin, stdout } = process;

  const cfg = config.loadConfig();
  const conn = db.connect(cfg);
  const rows = db.playlistUrls(conn, playlistName);
  conn.close();
  if (!rows.length) {
    stdout.write(`Playlist '${playlistName}' is empty or does not exist.\n`);
    return;
  }
  const playlistFile = config.exportPath(playlistName, cfg);
  fs.mkdirSync(path.dirname(playlistFile), { recursive: true });
  fs.writeFileSync(playlistFile, rows.map((r) => r.url).join('\n') + '\n', 'utf8');

  const sockPath = socketPath();
  const { proc } = player.spawnMpvWithIpc(playlistFile, sockPath);
  proc.stdout?.on('data', () => {});
  proc.stderr?.on('data', () => {});

  let mpv: MpvClient | null = null;
  try {
    await waitForSocket(sockPath);
    mpv = await connectMpv(sockPath);
  } catch (err: any) {
    stdout.write(`Warning: mpv IPC unavailable (${err.message}).\n`);
  }

  const ctx: LlmContext = { playlistName, mpv };

  stdout.write(`\n▶ Playing '${playlistName}' (${rows.length} songs)\n`);
  stdout.write(HELP);

  let statusTimer: NodeJS.Timeout | null = null;
  let lineBuffer = '';
  let typeMode = false;

  async function refreshStatus(): Promise<void> {
    if (!mpv) return;
    try {
      const [pos, dur, paused, vol, muted] = await Promise.all([
        mpv.get('time-pos').catch(() => 0),
        mpv.get('duration').catch(() => 0),
        mpv.get('pause').catch(() => false),
        mpv.get('volume').catch(() => 100),
        mpv.get('mute').catch(() => false),
      ]);
      const fmt = (s: number) => { if (!s || s < 0) return '--:--'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
      const icon = paused ? '⏸' : '▶';
      const muteStr = muted ? '🔇' : '🔊';
      stdout.write(`\r\x1b[K${icon} ${fmt(pos)}/${fmt(dur)} ${muteStr}${vol}%  `);
      if (typeMode) stdout.write(`❯ ${lineBuffer}`);
      else if (lineBuffer) stdout.write(`  ${lineBuffer}`);
    } catch { /* */ }
  }

  function clearLine(): void {
    stdout.write('\r\x1b[K');
  }

  function print(msg: string): void {
    clearLine();
    stdout.write(msg + '\n');
    refreshStatus();
  }

  statusTimer = setInterval(() => refreshStatus(), 2000);

  if (stdin.isTTY) {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
  }

  const history: ChatMessage[] = [];

  return new Promise((resolve) => {
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      if (statusTimer) clearInterval(statusTimer);
      clearLine();
      if (mpv) mpv.close();
      try { proc.kill("SIGTERM"); } catch { /* */ }
      try { fs.unlinkSync(sockPath); } catch { /* */ }
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdout.write('\n■ Stopped.\n');
      resolve();
      process.exit(0);
    };

    const onKeypress = async (str: string, key: any) => {
      if (done) return;

      if (key?.ctrl && key?.name === 'c') {
        if (mpv) { try { await mpv.send(['quit']); } catch { /* */ } }
        cleanup();
        return;
      }

      // === Type mode ===
      if (typeMode) {
        if (key?.name === 'escape') {
          typeMode = false;
          lineBuffer = '';
          refreshStatus();
          return;
        }
        if (key?.name === 'return' || str === '\r' || str === '\n') {
          const input = lineBuffer.trim();
          lineBuffer = '';
          if (!input) { refreshStatus(); return; }
          await processCommand(input, ctx, mpv, playlistName, history, print, stdout);
          refreshStatus();
          return;
        }
        if (key?.name === 'backspace') {
          lineBuffer = lineBuffer.slice(0, -1);
          refreshStatus();
          return;
        }
        if (str && str.length === 1 && str >= ' ' && !key?.ctrl && !key?.meta) {
          lineBuffer += str;
          refreshStatus();
        }
        return;
      }

      // === Shortcut mode ===
      switch (str) {
        case ' ':
          if (mpv) {
            try {
              const paused = await mpv.get('pause');
              await mpv.set('pause', !paused);
              print(!paused ? '⏸ Paused' : '▶ Resumed');
            } catch { /* */ }
          }
          return;
        case 'n':
          if (mpv) { try { await mpv.send(['playlist-next', 'force']); print('⏭ Next'); } catch { /* */ } }
          return;
        case 'p':
          if (mpv) { try { await mpv.send(['playlist-prev', 'force']); print('⏮ Prev'); } catch { /* */ } }
          return;
        case 'm':
          if (mpv) {
            try {
              const muted = await mpv.get('mute');
              await mpv.set('mute', !muted);
              print(!muted ? '🔇 Muted' : '🔊 Unmuted');
            } catch { /* */ }
          }
          return;
        case 'l':
          await processCommand('like', ctx, mpv, playlistName, history, print, stdout);
          refreshStatus();
          return;
        case 'a':
          typeMode = true;
          lineBuffer = 'add ';
          refreshStatus();
          return;
        case 'c':
          typeMode = true;
          lineBuffer = '';
          refreshStatus();
          return;
        case 'q':
          if (mpv) { try { await mpv.send(['quit']); } catch { /* */ } }
          cleanup();
          return;
        case '+':
        case '=':
          if (mpv) {
            try {
              const v = await mpv.get('volume');
              const nv = Math.min(100, v + 5);
              await mpv.set('volume', nv);
              print(`🔊 ${nv}%`);
            } catch { /* */ }
          }
          return;
        case '-':
          if (mpv) {
            try {
              const v = await mpv.get('volume');
              const nv = Math.max(0, v - 5);
              await mpv.set('volume', nv);
              print(`🔊 ${nv}%`);
            } catch { /* */ }
          }
          return;
        default:
          if (key?.name === 'right') {
            if (mpv) { try { await mpv.send(['seek', 10, 'relative']); } catch { /* */ } }
            return;
          }
          if (key?.name === 'left') {
            if (mpv) { try { await mpv.send(['seek', -10, 'relative']); } catch { /* */ } }
            return;
          }
          break;
      }
    };

    stdin.on('keypress', onKeypress);
    refreshStatus();

    proc.on('exit', () => cleanup());
  });
}

// ---------------------------------------------------------------------------
// Command processor — direct commands first, LLM fallback
// ---------------------------------------------------------------------------

async function processCommand(
  input: string,
  ctx: LlmContext,
  mpv: MpvClient | null,
  playlistName: string,
  history: ChatMessage[],
  print: (msg: string) => void,
  stdout: NodeJS.WriteStream,
): Promise<void> {
  const lower = input.toLowerCase().trim();
  const parts = lower.split(/\s+/);
  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'pause':
    case 'resume':
      if (mpv) {
        try {
          const paused = await mpv.get('pause');
          await mpv.set('pause', !paused);
          print(!paused ? '⏸ Paused' : '▶ Resumed');
        } catch { /* */ }
      }
      return;

    case 'next':
    case 'skip':
      if (mpv) { try { await mpv.send(['playlist-next', 'force']); print('⏭ Next'); } catch { /* */ } }
      return;

    case 'prev':
    case 'previous':
      if (mpv) { try { await mpv.send(['playlist-prev', 'force']); print('⏮ Prev'); } catch { /* */ } }
      return;

    case 'mute':
      if (mpv) {
        try {
          const muted = await mpv.get('mute');
          await mpv.set('mute', !muted);
          print(!muted ? '🔇 Muted' : '🔊 Unmuted');
        } catch { /* */ }
      }
      return;

    case 'vol':
    case 'volume': {
      const level = parseInt(arg, 10);
      if (isNaN(level)) { print('Usage: vol <0-100>'); return; }
      if (mpv) {
        const v = Math.max(0, Math.min(100, level));
        await mpv.set('volume', v);
        print(`🔊 ${v}%`);
      }
      return;
    }

    case 'seek': {
      const seconds = parseFloat(arg);
      if (isNaN(seconds)) { print('Usage: seek <seconds>'); return; }
      if (mpv) { try { await mpv.send(['seek', seconds, 'relative']); print(`Seeked ${seconds}s`); } catch { /* */ } }
      return;
    }

    case 'status':
      if (mpv) {
        try {
          const [url, pos, dur, paused, vol, muted] = await Promise.all([
            mpv.get('path').catch(() => '?'),
            mpv.get('time-pos').catch(() => 0),
            mpv.get('duration').catch(() => 0),
            mpv.get('pause').catch(() => false),
            mpv.get('volume').catch(() => 100),
            mpv.get('mute').catch(() => false),
          ]);
          const fmt = (s: number) => { if (!s || s < 0) return '--:--'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
          print(`Playing: ${url}\n${fmt(pos)}/${fmt(dur)}  ${paused ? 'paused' : 'playing'}  vol ${vol}${muted ? ' (muted)' : ''}`);
        } catch { /* */ }
      }
      return;

    case 'like': {
      if (!mpv) { print('No playback.'); return; }
      try {
        const url = await mpv.get('path');
        if (!url) { print('Could not determine current song.'); return; }
        const conn = db.connect();
        const created = db.likeSong(conn, playlistName, url);
        const isLiked = db.isSongLiked(conn, playlistName, url);
        conn.close();
        print(created ? `♥ Liked in '${playlistName}'` : isLiked ? 'Already liked' : 'Song not in playlist');
      } catch (e: any) { print(`Error: ${e.message}`); }
      return;
    }

    case 'liked': {
      const conn = db.connect();
      const rows = db.likedSongs(conn, playlistName);
      conn.close();
      if (!rows.length) { print(`No liked songs in '${playlistName}'.`); return; }
      print(`Liked in '${playlistName}':\n` + rows.map((r) => `  ${r.url}  ${r.title || ''}`).join('\n'));
      return;
    }

    case 'add': {
      if (!arg) { print('Usage: add <url>'); return; }
      const url = config.normalizeUrl(arg.replace(/^['"]+|['"]+$/g, ''));
      print(`Validating '${url}'...`);
      const ok = await player.validateUrlAsync(url);
      if (!ok) { print(`Could not validate '${url}'. Not added.`); return; }
      const conn = db.connect();
      const added = db.addSongToPlaylist(conn, url, playlistName);
      conn.close();
      if (mpv) {
        try { await mpv.send(['loadfile', url, 'append']); } catch { /* */ }
      }
      print(added ? `+ Added '${url}' to '${playlistName}'` : `Already in '${playlistName}'`);
      return;
    }

    case 'help':
    case '?':
      print(`Commands: add <url>, like, liked, vol <n>, seek <n>, pause, next, prev, mute, status, q\nOr type anything to talk to the assistant.`);
      return;
  }

  // --- LLM fallback ---
  print('Thinking...');
  history.push({ role: 'user', content: input });
  try {
    const result = await chat(history, ctx);
    print(result);
    history.push({ role: 'assistant', content: result });
  } catch (err: any) {
    print(`Error: ${err.message}\nIs Ollama running? (ollama serve)`);
  }
}
