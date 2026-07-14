import { test } from 'node:test';
import * as assert from 'node:assert';
import { createIsolatedEnv } from './helper.js';
import * as db from '../src/db.js';
import * as config from '../src/config.js';

test('schema is created correctly on connection', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    const rows = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tables = new Set(rows.map(r => r.name));
    
    assert.ok(tables.has('songs'));
    assert.ok(tables.has('playlists'));
    assert.ok(tables.has('playlist_songs'));
    assert.ok(tables.has('play_history'));
    
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('getOrCreatePlaylist is idempotent', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    const id1 = db.getOrCreatePlaylist(conn, 'study');
    const id2 = db.getOrCreatePlaylist(conn, 'study');
    assert.strictEqual(id1, id2);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('addSongToPlaylist adds url to playlist correctly', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    const created = db.addSongToPlaylist(conn, 'https://x/a', 'study');
    assert.strictEqual(created, true);
    
    const rows = db.playlistUrls(conn, 'study') as any[];
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].url, 'https://x/a');
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('duplicate url in same playlist returns false', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study');
    const created = db.addSongToPlaylist(conn, 'https://x/a', 'study');
    assert.strictEqual(created, false);
    
    const rows = db.playlistUrls(conn, 'study') as any[];
    assert.strictEqual(rows.length, 1);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('same url in different playlists is allowed', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/a', 'study');
    db.addSongToPlaylist(conn, 'https://x/a', 'chill');
    
    assert.strictEqual(db.playlistUrls(conn, 'study').length, 1);
    assert.strictEqual(db.playlistUrls(conn, 'chill').length, 1);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('position preserves order in playlists', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://x/1', 'study');
    db.addSongToPlaylist(conn, 'https://x/2', 'study');
    db.addSongToPlaylist(conn, 'https://x/3', 'study');
    
    const urls = db.playlistUrls(conn, 'study').map(r => r.url);
    assert.deepStrictEqual(urls, ['https://x/1', 'https://x/2', 'https://x/3']);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('listPlaylists returns all playlists alphabetically', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.getOrCreatePlaylist(conn, 'chill');
    db.getOrCreatePlaylist(conn, 'study');
    
    const names = db.listPlaylists(conn).map(r => r.name);
    assert.deepStrictEqual(names, ['chill', 'study']);
    conn.close();
  } finally {
    env.cleanup();
  }
});
