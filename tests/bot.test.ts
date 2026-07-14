import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createIsolatedEnv } from './helper.js';
import * as db from '../src/db.js';
import * as config from '../src/config.js';
import * as staging from '../src/staging.js';
import { player } from '../src/player.js';
import { downloader } from '../src/downloader.js';
import { createBot, runCleanup } from '../src/bot.js';

const ALLOWED_ID = 987654321;

// Helper to construct a Telegram update payload with command entities
function makeMessageUpdate(text: string, userId: number = ALLOWED_ID): any {
  const entities: any[] = [];
  if (text.startsWith('/')) {
    const firstWord = text.split(/\s+/)[0];
    entities.push({
      offset: 0,
      length: firstWord.length,
      type: 'bot_command'
    });
  }
  return {
    update_id: 10000 + Math.floor(Math.random() * 1000),
    message: {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: 999,
        type: 'private',
        first_name: 'TestUser'
      },
      from: {
        id: userId,
        is_bot: false,
        first_name: 'TestUser'
      },
      text: text,
      entities: entities.length > 0 ? entities : undefined
    }
  };
}

test('bot whitelist blocks unauthorized users', async (t) => {
  const env = createIsolatedEnv();
  const warnMock = t.mock.method(console, 'warn', () => {});
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: {} } as any;
    });
    
    // Message from unauthorized user (ID: 111)
    const update = makeMessageUpdate('/playlists', 111);
    await bot.handleUpdate(update);
    
    assert.strictEqual(apiCalls.length, 0);
    assert.strictEqual(warnMock.mock.callCount(), 1);
  } finally {
    env.cleanup();
  }
});

test('bot /playlists command lists playlists', async (t) => {
  const env = createIsolatedEnv();
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: { message_id: 101 } } as any;
    });

    // 1. When empty
    await bot.handleUpdate(makeMessageUpdate('/playlists'));
    assert.ok(apiCalls.length > 0);
    assert.strictEqual(apiCalls[0].method, 'sendMessage');
    assert.ok(apiCalls[0].payload.text.includes('No playlists'));

    // 2. When playlists exist
    const conn = db.connect();
    db.getOrCreatePlaylist(conn, 'study');
    db.getOrCreatePlaylist(conn, 'chill');
    conn.close();

    apiCalls.length = 0; // reset
    await bot.handleUpdate(makeMessageUpdate('/playlists'));
    assert.ok(apiCalls.length > 0);
    assert.strictEqual(apiCalls[0].method, 'sendMessage');
    assert.ok(apiCalls[0].payload.text.includes('Your Playlists:'));
    assert.ok(apiCalls[0].payload.text.includes('study'));
    assert.ok(apiCalls[0].payload.text.includes('chill'));
  } finally {
    env.cleanup();
  }
});

test('bot /show command displays playlist songs', async (t) => {
  const env = createIsolatedEnv();
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: { message_id: 101 } } as any;
    });

    // 1. Missing arg
    await bot.handleUpdate(makeMessageUpdate('/show'));
    assert.ok(apiCalls[0].payload.text.includes('Please specify a playlist name'));

    // 2. Empty/Missing playlist
    apiCalls.length = 0;
    await bot.handleUpdate(makeMessageUpdate('/show study'));
    assert.ok(apiCalls[0].payload.text.includes('empty or does not exist'));

    // 3. Populate and show
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study', 'Song A');
    conn.close();

    apiCalls.length = 0;
    await bot.handleUpdate(makeMessageUpdate('/show study'));
    assert.ok(apiCalls[0].payload.text.includes("Playlist 'study':"));
    assert.ok(apiCalls[0].payload.text.includes('Song A'));
    assert.ok(apiCalls[0].payload.text.includes('https://x/a'));
  } finally {
    env.cleanup();
  }
});

test('bot /add command stages URLs with normalization', async (t) => {
  const env = createIsolatedEnv();
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: { message_id: 101 } } as any;
    });

    // 1. No URL
    await bot.handleUpdate(makeMessageUpdate('/add'));
    assert.ok(apiCalls[0].payload.text.includes('Please specify a URL'));

    // 2. Add unnormalized YouTube URL
    apiCalls.length = 0;
    await bot.handleUpdate(makeMessageUpdate('/add https://www.youtube.com/watch?v=QDeGyYvyNqs&list=RDQDeGyYvyNqs --playlist study'));
    
    const entries = staging.readEntries(config.stagingPath());
    assert.deepStrictEqual(entries, [
      ['https://www.youtube.com/watch?v=QDeGyYvyNqs', 'study']
    ]);
    assert.ok(apiCalls[0].payload.text.includes("Staged 'https://www.youtube.com/watch?v=QDeGyYvyNqs' for playlist 'study'"));
  } finally {
    env.cleanup();
  }
});

test('bot /import validates and imports staged tracks', async (t) => {
  const env = createIsolatedEnv();
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: { message_id: 101 } } as any;
    });

    t.mock.method(player, 'mpvAvailable', () => true);
    t.mock.method(player, 'validateUrl', (url: string) => url === 'https://good');

    // 1. No entries staged
    await bot.handleUpdate(makeMessageUpdate('/import'));
    assert.ok(apiCalls[0].payload.text.includes('No staged entries to import'));

    // 2. Stage good and bad links
    staging.prependEntry(config.stagingPath(), 'https://good', 'study');
    staging.prependEntry(config.stagingPath(), 'https://bad', 'study');

    apiCalls.length = 0; // reset
    await bot.handleUpdate(makeMessageUpdate('/import'));
    
    const texts = apiCalls.map(c => c.payload.text || '');
    assert.ok(texts.some(t => t.includes('FAIL  https://bad')));
    assert.ok(texts.some(t => t.includes('OK: https://good -> study')));
    assert.ok(texts.some(t => t.includes('Imported 1 links to SQLite')));

    const conn = db.connect();
    const rows = db.playlistUrls(conn, 'study');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].url, 'https://good');
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('bot /play downloads, sends audio, deletes temp cache, and logs to SQLite', async (t) => {
  const env = createIsolatedEnv();
  
  // Create cache directory structure
  fs.mkdirSync(downloader.getCacheDir(), { recursive: true });

  let downloadCalled = false;
  let downloadedId = '';
  const dummyFile = path.join(os.tmpdir(), 'dummy_song.mp3');
  fs.writeFileSync(dummyFile, 'dummy audio data', 'utf8');

  // Mock downloader
  t.mock.method(downloader, 'downloadAudio', (url: string, uniqueId: string) => {
    downloadCalled = true;
    downloadedId = uniqueId;
    return dummyFile;
  });

  try {
    const bot = createBot('dummy-token', ALLOWED_ID);
    
    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      if (method === 'sendAudio') {
        return { ok: true, result: { message_id: 888, chat: { id: 999 } } } as any;
      }
      return { ok: true, result: { message_id: 101 } } as any;
    });

    // Setup playlist in DB
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://good', 'study', 'Song A');
    conn.close();

    // Trigger bot /play
    await bot.handleUpdate(makeMessageUpdate('/play study'));

    assert.strictEqual(downloadCalled, true);
    assert.ok(downloadedId.startsWith('song_study_'));
    
    const audioCall = apiCalls.find(c => c.method === 'sendAudio');
    assert.ok(audioCall !== undefined);
    assert.strictEqual(audioCall.payload.audio.fileData, dummyFile);
    
    // Check local file deletion
    assert.strictEqual(fs.existsSync(dummyFile), false);

    // Verify record exists in sent_messages
    const checkConn = db.connect();
    const row = checkConn.prepare('SELECT * FROM sent_messages WHERE message_id = 888').get() as any;
    assert.ok(row !== undefined);
    assert.strictEqual(row.message_id, 888);
    assert.strictEqual(row.chat_id, 999);
    checkConn.close();
  } finally {
    env.cleanup();
    if (fs.existsSync(dummyFile)) {
      fs.unlinkSync(dummyFile);
    }
  }
});

test('bot cleanup daemon removes expired messages from Telegram and purges DB logs', async (t) => {
  const env = createIsolatedEnv();
  try {
    const bot = createBot('dummy-token', ALLOWED_ID);

    const apiCalls: any[] = [];
    bot.api.config.use(async (prev, method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: true } as any;
    });

    const conn = db.connect();
    
    // Create an expired message (25 hours ago)
    const date25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.recordSentMessage(conn, 111, 999, date25h);

    // Create a non-expired message (1 hour ago)
    const date1h = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    db.recordSentMessage(conn, 222, 999, date1h);
    
    conn.close();

    // Run cleanup
    await runCleanup(bot);

    // Message 111 should be deleted, 222 should not
    const deleteCalls = apiCalls.filter(c => c.method === 'deleteMessage');
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(deleteCalls[0].payload.message_id, 111);

    // Check DB state
    const checkConn = db.connect();
    const row111 = checkConn.prepare('SELECT 1 FROM sent_messages WHERE message_id = 111').get();
    const row222 = checkConn.prepare('SELECT 1 FROM sent_messages WHERE message_id = 222').get();
    
    assert.strictEqual(row111, undefined);
    assert.ok(row222 !== undefined);
    
    checkConn.close();
  } finally {
    env.cleanup();
  }
});
