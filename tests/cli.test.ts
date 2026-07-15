import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createIsolatedEnv } from './helper.js';
import * as db from '../src/db.js';
import * as config from '../src/config.js';
import * as staging from '../src/staging.js';
import { player } from '../src/player.js';
import { createProgram } from '../src/main.js';

test('help command shows all expected commands', async (t) => {
  const program = createProgram();
  program.exitOverride();
  
  let output = '';
  const writeMock = t.mock.method(process.stdout, 'write', (str: any) => {
    output += str;
    return true;
  });

  try {
    await program.parseAsync(['node', 'imj', '--help']);
  } catch {
    // expected due to exitOverride()
  }

  for (const cmd of ['setup', 'create', 'add', 'import-staging', 'playlists', 'show', 'export', 'play']) {
    assert.ok(output.includes(cmd), `Help should list command: ${cmd}`);
  }
});

test('create command creates a named playlist', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'create', 'study']);
    
    const conn = db.connect();
    const row = db.getPlaylistByName(conn, 'study');
    assert.ok(row !== undefined);
    assert.strictEqual(row.name, 'study');
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('add command writes staging entries newest first', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'add', 'https://url1', '--playlist', 'study']);
    await program.parseAsync(['node', 'imj', 'add', 'https://url2', '--playlist', 'chill']);
    
    const entries = staging.readEntries(config.stagingPath());
    assert.deepStrictEqual(entries, [
      ['https://url2', 'chill'],
      ['https://url1', 'study']
    ]);
  } finally {
    env.cleanup();
  }
});

test('add command defaults to the default playlist', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'add', 'https://url1']);
    
    const entries = staging.readEntries(config.stagingPath());
    assert.deepStrictEqual(entries, [
      ['https://url1', 'default']
    ]);
  } finally {
    env.cleanup();
  }
});

test('add command expands YouTube playlists using yt-dlp', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  
  t.mock.method(player, 'ytDlpAvailable', () => true);
  t.mock.method(player, 'extractPlaylistUrls', (url: string) => {
    assert.strictEqual(url, 'https://www.youtube.com/playlist?list=PLRW80bBvVD3UXB_ExupmVqzTUh3vqlxe9');
    return [
      'https://www.youtube.com/watch?v=1',
      'https://www.youtube.com/watch?v=2'
    ];
  });

  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync([
      'node', 'imj', 'add', 
      'https://www.youtube.com/playlist?list=PLRW80bBvVD3UXB_ExupmVqzTUh3vqlxe9', 
      '--playlist', 'study'
    ]);
    
    const entries = staging.readEntries(config.stagingPath());
    assert.deepStrictEqual(entries, [
      ['https://www.youtube.com/watch?v=1', 'study'],
      ['https://www.youtube.com/watch?v=2', 'study']
    ]);
  } finally {
    env.cleanup();
  }
});

test('import-staging validates and imports working non-duplicate URLs', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  
  t.mock.method(player, 'mpvAvailable', () => true);
  t.mock.method(player, 'validateUrl', (url: string) => url === 'https://good');
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const p = config.stagingPath();
    staging.prependEntry(p, 'https://good', 'study');
    staging.prependEntry(p, 'https://bad', 'study');
    
    await program.parseAsync(['node', 'imj', 'import-staging']);
    
    const conn = db.connect();
    const rows = db.playlistUrls(conn, 'study');
    const urls = rows.map(r => r.url);
    assert.ok(urls.includes('https://good'));
    assert.ok(!urls.includes('https://bad'));
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('import-staging flushes imported but leaves failed entries', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  
  t.mock.method(player, 'mpvAvailable', () => true);
  t.mock.method(player, 'validateUrl', (url: string) => url === 'https://good');
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const p = config.stagingPath();
    staging.prependEntry(p, 'https://good', 'study');
    staging.prependEntry(p, 'https://bad', 'study');
    
    await program.parseAsync(['node', 'imj', 'import-staging']);
    
    const remaining = staging.readEntries(p);
    assert.deepStrictEqual(remaining, [
      ['https://bad', 'study']
    ]);
  } finally {
    env.cleanup();
  }
});

test('import-staging skips duplicate entries', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  
  t.mock.method(player, 'mpvAvailable', () => true);
  t.mock.method(player, 'validateUrl', () => true);
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const p = config.stagingPath();
    staging.prependEntry(p, 'https://dup', 'study');
    
    await program.parseAsync(['node', 'imj', 'import-staging']);
    
    // Add same dup again
    staging.prependEntry(p, 'https://dup', 'study');
    
    const newProgram = createProgram();
    newProgram.exitOverride();
    await newProgram.parseAsync(['node', 'imj', 'import-staging']);
    
    const conn = db.connect();
    const rows = db.playlistUrls(conn, 'study');
    assert.strictEqual(rows.length, 1);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('import-staging outputs message if empty', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  t.mock.method(player, 'mpvAvailable', () => true);

  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'import-staging']);
    
    assert.ok(output.includes('No staged entries'));
  } finally {
    env.cleanup();
  }
});

test('playlists command lists all playlists', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'create', 'study']);
    await program.parseAsync(['node', 'imj', 'create', 'chill']);
    
    output = ''; // clear log
    await program.parseAsync(['node', 'imj', 'playlists']);
    
    assert.ok(output.includes('study'));
    assert.ok(output.includes('chill'));
  } finally {
    env.cleanup();
  }
});

test('playlists command outputs message when empty', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'playlists']);
    
    assert.ok(output.includes('No playlists'));
  } finally {
    env.cleanup();
  }
});

test('show command prints URLs and titles', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study', 'Song A');
    conn.close();
    
    output = ''; // clear
    await program.parseAsync(['node', 'imj', 'show', 'study']);
    
    assert.ok(output.includes('https://x/a'));
    assert.ok(output.includes('Song A'));
  } finally {
    env.cleanup();
  }
});

test('show command prints message when empty/missing', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'show', 'nope']);
    
    assert.ok(output.includes('empty or does not exist'));
  } finally {
    env.cleanup();
  }
});

test('export command writes a file', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study');
    db.addSongToPlaylist(conn, 'https://x/b', 'study');
    conn.close();
    
    await program.parseAsync(['node', 'imj', 'export', 'study']);
    
    const out = config.exportPath('study');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('https://x/a'));
    assert.ok(content.includes('https://x/b'));
  } finally {
    env.cleanup();
  }
});

test('export command respects custom output path', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study');
    conn.close();
    
    const out = path.join(env.tempDir, 'custom.txt');
    await program.parseAsync(['node', 'imj', 'export', 'study', '--output', out]);
    
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('https://x/a'));
  } finally {
    env.cleanup();
  }
});

test('play command prints message when playlist empty', async (t) => {
  const env = createIsolatedEnv();
  const program = createProgram();
  program.exitOverride();
  let output = '';
  const logMock = t.mock.method(console, 'log', (str: any) => {
    output += str + '\n';
  });
  const writeMock = t.mock.method(process.stdout, 'write', (str: any) => {
    output += str;
    return true;
  });
  t.mock.method(player, 'mpvAvailable', () => true);

  try {
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', env.musicDir]);
    await program.parseAsync(['node', 'imj', 'play', 'nope']);
    
    assert.ok(output.includes('empty or does not exist'));
  } finally {
    env.cleanup();
  }
});
