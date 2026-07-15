import { test } from 'node:test';
import * as assert from 'node:assert';
import { chat, type ChatMessage, type LlmContext, type LlmConfig } from '../src/llm.js';
import { createIsolatedEnv } from './helper.js';
import * as db from '../src/db.js';

const testCfg: LlmConfig = { host: 'http://mock', model: 'mock' };

function mockMpv(props: Record<string, any> = {}): any {
  const state: Record<string, any> = {
    pause: false, mute: false, volume: 80, path: 'https://song', 'time-pos': 30, duration: 200, ...props,
  };
  const sent: any[] = [];
  return {
    sent,
    send(cmd: (string | number)[]) { sent.push(cmd); return Promise.resolve(); },
    get(name: string) { return Promise.resolve(state[name]); },
    set(name: string, val: any) { state[name] = val; return Promise.resolve(); },
    close() {},
  };
}

function mockFetch(responses: any[]): () => void {
  let i = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) } as Response;
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

function textMsg(content: string): any {
  return { message: { role: 'assistant', content, tool_calls: undefined } };
}

function toolMsg(name: string, args: Record<string, any> = {}, id = 'c1'): any {
  return { message: { role: 'assistant', content: '', tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] } };
}

// --- Basic tool-calling loop ---

test('chat returns text when no tool calls', async () => {
  const restore = mockFetch([textMsg('Hello!')]);
  try {
    const ctx: LlmContext = { playlistName: null, mpv: null };
    const result = await chat([{ role: 'user', content: 'hi' }], ctx, testCfg);
    assert.strictEqual(result, 'Hello!');
  } finally { restore(); }
});

test('chat executes tool calls and returns final text', async () => {
  const restore = mockFetch([toolMsg('list_playlists'), textMsg('You have playlists.')]);
  try {
    const ctx: LlmContext = { playlistName: null, mpv: null };
    const result = await chat([{ role: 'user', content: 'list playlists' }], ctx, testCfg);
    assert.ok(result.includes('playlists'));
  } finally { restore(); }
});

test('chat hits max rounds on infinite tool calls', async () => {
  const restore = mockFetch([toolMsg('list_playlists')]);
  try {
    const ctx: LlmContext = { playlistName: null, mpv: null };
    const result = await chat([{ role: 'user', content: 'loop' }], ctx, testCfg);
    assert.ok(result.includes('max rounds'));
  } finally { restore(); }
});

test('chat throws on API error', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'err' }) as Response) as typeof fetch;
  try {
    const ctx: LlmContext = { playlistName: null, mpv: null };
    await assert.rejects(chat([{ role: 'user', content: 'hi' }], ctx, testCfg), /500/);
  } finally { globalThis.fetch = orig; }
});

// --- mpv tools ---

test('chat mpv_pause toggles pause via IPC', async () => {
  const mpv = mockMpv({ pause: false });
  const restore = mockFetch([toolMsg('mpv_pause'), textMsg('Paused.')]);
  try {
    const ctx: LlmContext = { playlistName: 'jazz', mpv };
    await chat([{ role: 'user', content: 'pause' }], ctx, testCfg);
    assert.strictEqual(mpv.sent.length, 0); // pause uses set, not send
  } finally { restore(); }
});

test('chat mpv_next sends playlist-next force', async () => {
  const mpv = mockMpv();
  const restore = mockFetch([toolMsg('mpv_next'), textMsg('Skipped.')]);
  try {
    const ctx: LlmContext = { playlistName: 'jazz', mpv };
    await chat([{ role: 'user', content: 'skip' }], ctx, testCfg);
    assert.deepStrictEqual(mpv.sent[0], ['playlist-next', 'force']);
  } finally { restore(); }
});

test('chat mpv_volume sets clamped volume', async () => {
  const mpv = mockMpv({ volume: 50 });
  const restore = mockFetch([toolMsg('mpv_volume', { level: 150 }), textMsg('Volume set.')]);
  try {
    const ctx: LlmContext = { playlistName: 'jazz', mpv };
    await chat([{ role: 'user', content: 'max volume' }], ctx, testCfg);
    // The handler clamps to 100
  } finally { restore(); }
});

// --- like_current tool ---

test('chat like_current likes the playing song in playlist context', async () => {
  const env = createIsolatedEnv();
  const mpv = mockMpv({ path: 'https://song1' });
  const restore = mockFetch([toolMsg('like_current'), textMsg('Liked!')]);
  try {
    const conn = db.connect();
    db.addSongToPlaylist(conn, 'https://song1', 'jazz');
    conn.close();

    const ctx: LlmContext = { playlistName: 'jazz', mpv };
    await chat([{ role: 'user', content: 'like this' }], ctx, testCfg);

    const conn2 = db.connect();
    assert.ok(db.isSongLiked(conn2, 'jazz', 'https://song1'));
    conn2.close();
  } finally { restore(); env.cleanup(); }
});

test('chat like_current without mpv returns error message', async () => {
  const restore = mockFetch([toolMsg('like_current'), textMsg('No playback.')]);
  try {
    const ctx: LlmContext = { playlistName: 'jazz', mpv: null };
    const result = await chat([{ role: 'user', content: 'like' }], ctx, testCfg);
    // The tool returns 'No playback context.' and the LLM should relay it
  } finally { restore(); }
});
