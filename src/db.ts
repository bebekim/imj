import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as config from './config.js';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS songs (
  id integer primary key,
  url text not null unique,
  title text,
  duration integer
);

CREATE TABLE IF NOT EXISTS playlists (
  id integer primary key,
  name text not null unique,
  slug text not null unique
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id integer not null references playlists(id),
  song_id integer not null references songs(id),
  position integer,
  primary key (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS play_history (
  id integer primary key,
  song_id integer not null references songs(id),
  played_at text not null
);

CREATE TABLE IF NOT EXISTS liked_playlist_songs (
  playlist_id integer not null references playlists(id),
  song_id integer not null references songs(id),
  liked_at text not null,
  primary key (playlist_id, song_id)
);
`;

export function connect(cfg?: Record<string, any> | null): DatabaseSync {
  const p = config.dbPath(cfg);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const conn = new DatabaseSync(p);
  conn.exec(SCHEMA);
  // Migration: add duration column if missing (existing DBs created before this column)
  const cols = conn.prepare('PRAGMA table_info(songs)').all() as any[];
  if (!cols.some((c) => c.name === 'duration')) {
    conn.exec('ALTER TABLE songs ADD COLUMN duration integer');
  }
  return conn;
}

export function getOrCreatePlaylist(conn: DatabaseSync, name: string): number {
  const slug = config.slugify(name);
  const row = conn.prepare('SELECT id FROM playlists WHERE name = ?').get(name) as any;
  if (row) {
    return row.id;
  }
  conn.prepare('INSERT INTO playlists (name, slug) VALUES (?, ?)').run(name, slug);
  const lastRow = conn.prepare('SELECT last_insert_rowid() as id').get() as any;
  return lastRow.id;
}

export function getPlaylistByName(conn: DatabaseSync, name: string): any {
  return conn.prepare('SELECT * FROM playlists WHERE name = ? OR slug = ?').get(name, name);
}

export function addSongToPlaylist(conn: DatabaseSync, url: string, playlistName: string, title?: string | null, duration?: number | null): boolean {
  const pid = getOrCreatePlaylist(conn, playlistName);
  let song = conn.prepare('SELECT id FROM songs WHERE url = ?').get(url) as any;
  let sid: number;
  if (song) {
    sid = song.id;
    if (title) {
      conn.prepare('UPDATE songs SET title = ? WHERE id = ?').run(title, sid);
    }
    if (duration != null) {
      conn.prepare('UPDATE songs SET duration = ? WHERE id = ?').run(duration, sid);
    }
  } else {
    conn.prepare('INSERT INTO songs (url, title, duration) VALUES (?, ?, ?)').run(url, title ?? null, duration ?? null);
    const lastRow = conn.prepare('SELECT last_insert_rowid() as id').get() as any;
    sid = lastRow.id;
  }

  const existing = conn.prepare('SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').get(pid, sid);
  if (existing) {
    return false;
  }

  const maxPosRow = conn.prepare('SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_songs WHERE playlist_id = ?').get(pid) as any;
  const pos = maxPosRow.max_pos + 1;
  conn.prepare('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)').run(pid, sid, pos);
  return true;
}

export function listPlaylists(conn: DatabaseSync): any[] {
  return conn.prepare(`
    SELECT p.name, p.slug,
      COUNT(ps.song_id) AS song_count,
      COALESCE(SUM(s.duration), 0) AS total_duration
    FROM playlists p
    LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
    LEFT JOIN songs s ON s.id = ps.song_id
    GROUP BY p.id
    ORDER BY p.name
  `).all();
}

export function playlistUrls(conn: DatabaseSync, playlistName: string): any[] {
  return conn.prepare(`
    SELECT s.url, s.title FROM songs s
    JOIN playlist_songs ps ON ps.song_id = s.id
    JOIN playlists p ON p.id = ps.playlist_id
    WHERE p.name = ? OR p.slug = ?
    ORDER BY ps.position
  `).all(playlistName, playlistName);
}

export function getSongByUrl(conn: DatabaseSync, url: string): any {
  return conn.prepare('SELECT * FROM songs WHERE url = ?').get(url);
}

export function likeSong(conn: DatabaseSync, playlistName: string, url: string): boolean {
  const playlist = getPlaylistByName(conn, playlistName);
  if (!playlist) return false;
  const song = getSongByUrl(conn, url);
  if (!song) return false;
  const existing = conn.prepare('SELECT 1 FROM liked_playlist_songs WHERE playlist_id = ? AND song_id = ?').get(playlist.id, song.id);
  if (existing) return false;
  conn.prepare('INSERT INTO liked_playlist_songs (playlist_id, song_id, liked_at) VALUES (?, ?, ?)').run(playlist.id, song.id, new Date().toISOString());
  return true;
}

export function unlikeSong(conn: DatabaseSync, playlistName: string, url: string): boolean {
  const playlist = getPlaylistByName(conn, playlistName);
  if (!playlist) return false;
  const song = getSongByUrl(conn, url);
  if (!song) return false;
  const result = conn.prepare('DELETE FROM liked_playlist_songs WHERE playlist_id = ? AND song_id = ?').run(playlist.id, song.id);
  return result.changes > 0;
}

export function isSongLiked(conn: DatabaseSync, playlistName: string, url: string): boolean {
  const playlist = getPlaylistByName(conn, playlistName);
  if (!playlist) return false;
  const song = getSongByUrl(conn, url);
  if (!song) return false;
  const row = conn.prepare('SELECT 1 FROM liked_playlist_songs WHERE playlist_id = ? AND song_id = ?').get(playlist.id, song.id);
  return row !== undefined;
}

export function likedSongs(conn: DatabaseSync, playlistName: string): any[] {
  const playlist = getPlaylistByName(conn, playlistName);
  if (!playlist) return [];
  return conn.prepare(`
    SELECT s.url, s.title, lps.liked_at FROM songs s
    JOIN liked_playlist_songs lps ON lps.song_id = s.id
    WHERE lps.playlist_id = ?
    ORDER BY lps.liked_at DESC
  `).all(playlist.id);
}
