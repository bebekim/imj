import { test } from 'node:test';
import * as assert from 'node:assert';
import { createIsolatedEnv } from './helper.js';
import * as db from '../src/db.js';

test('likeSong marks a song as liked in playlist context', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    const result = db.likeSong(conn, 'jazz', 'https://song1');
    assert.strictEqual(result, true);
    assert.ok(db.isSongLiked(conn, 'jazz', 'https://song1'));
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likeSong returns false for already liked song', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    db.likeSong(conn, 'jazz', 'https://song1');
    const result = db.likeSong(conn, 'jazz', 'https://song1');
    assert.strictEqual(result, false);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likeSong returns false for nonexistent playlist', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    const result = db.likeSong(conn, 'rock', 'https://song1');
    assert.strictEqual(result, false);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likeSong returns false for nonexistent song', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    const result = db.likeSong(conn, 'jazz', 'https://nonexistent');
    assert.strictEqual(result, false);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likeSong is playlist-scoped — same song liked in different playlists', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    db.addSongToPlaylist(conn, 'https://song1', 'study');

    assert.strictEqual(db.likeSong(conn, 'jazz', 'https://song1'), true);
    assert.strictEqual(db.likeSong(conn, 'study', 'https://song1'), true);

    assert.ok(db.isSongLiked(conn, 'jazz', 'https://song1'));
    assert.ok(db.isSongLiked(conn, 'study', 'https://song1'));
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('unlikeSong removes the like', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    db.likeSong(conn, 'jazz', 'https://song1');
    assert.ok(db.isSongLiked(conn, 'jazz', 'https://song1'));

    const result = db.unlikeSong(conn, 'jazz', 'https://song1');
    assert.strictEqual(result, true);
    assert.ok(!db.isSongLiked(conn, 'jazz', 'https://song1'));
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('unlikeSong returns false for non-liked song', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    const result = db.unlikeSong(conn, 'jazz', 'https://song1');
    assert.strictEqual(result, false);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likedSongs returns liked songs with metadata', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz', 'Track A');
    db.addSongToPlaylist(conn, 'https://song2', 'jazz', 'Track B');
    db.likeSong(conn, 'jazz', 'https://song1');
    db.likeSong(conn, 'jazz', 'https://song2');

    const rows = db.likedSongs(conn, 'jazz');
    assert.strictEqual(rows.length, 2);
    const urls = rows.map((r) => r.url);
    assert.ok(urls.includes('https://song1'));
    assert.ok(urls.includes('https://song2'));
    assert.ok(rows.every((r) => r.liked_at));
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likedSongs returns empty for playlist with no likes', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    const rows = db.likedSongs(conn, 'jazz');
    assert.strictEqual(rows.length, 0);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('likedSongs returns empty for nonexistent playlist', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    const rows = db.likedSongs(conn, 'nonexistent');
    assert.strictEqual(rows.length, 0);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('getSongByUrl returns song by URL', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz', 'My Song');
    const song = db.getSongByUrl(conn, 'https://song1');
    assert.ok(song);
    assert.strictEqual(song.title, 'My Song');
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('getSongByUrl returns undefined for missing URL', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    const song = db.getSongByUrl(conn, 'https://nonexistent');
    assert.strictEqual(song, undefined);
    conn.close();
  } finally {
    env.cleanup();
  }
});

test('playlist lookup works by slug', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'Late Night Jazz', 'Track A');
    db.addSongToPlaylist(conn, 'https://song2', 'Late Night Jazz', 'Track B');

    // playlistUrls by slug
    const rows = db.playlistUrls(conn, 'late-night-jazz');
    assert.strictEqual(rows.length, 2);

    // getPlaylistByName by slug
    const playlist = db.getPlaylistByName(conn, 'late-night-jazz');
    assert.ok(playlist);
    assert.strictEqual(playlist.name, 'Late Night Jazz');

    // likeSong by slug
    assert.strictEqual(db.likeSong(conn, 'late-night-jazz', 'https://song1'), true);
    assert.ok(db.isSongLiked(conn, 'late-night-jazz', 'https://song1'));

    // likedSongs by slug
    const liked = db.likedSongs(conn, 'late-night-jazz');
    assert.strictEqual(liked.length, 1);
    assert.strictEqual(liked[0].url, 'https://song1');

    conn.close();
  } finally {
    env.cleanup();
  }
});

test('listPlaylists returns song count and total duration', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz', 'Track A', 180);
    db.addSongToPlaylist(conn, 'https://song2', 'jazz', 'Track B', 240);
    db.addSongToPlaylist(conn, 'https://song3', 'study', 'Track C', 60);

    const rows = db.listPlaylists(conn);
    assert.strictEqual(rows.length, 2);

    const jazz = rows.find((r) => r.name === 'jazz');
    assert.ok(jazz);
    assert.strictEqual(jazz.song_count, 2);
    assert.strictEqual(jazz.total_duration, 420);

    const study = rows.find((r) => r.name === 'study');
    assert.ok(study);
    assert.strictEqual(study.song_count, 1);
    assert.strictEqual(study.total_duration, 60);

    conn.close();
  } finally {
    env.cleanup();
  }
});

test('listPlaylists returns zero count and duration for empty playlist', () => {
  const env = createIsolatedEnv();
  try {
    const conn = db.connect();
    db.getOrCreatePlaylist(conn, 'empty');

    const rows = db.listPlaylists(conn);
    assert.strictEqual(rows.length, 1);

    const empty = rows.find((r) => r.name === 'empty');
    assert.ok(empty);
    assert.strictEqual(empty.song_count, 0);
    assert.strictEqual(empty.total_duration, 0);

    conn.close();
  } finally {
    env.cleanup();
  }
});
