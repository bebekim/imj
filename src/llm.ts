import * as db from './db.js';
import type { MpvClient } from './mpv-ipc.js';

// ---------------------------------------------------------------------------
// Context — passed into the LLM layer, no global mutable state
// ---------------------------------------------------------------------------

export interface LlmContext {
  playlistName: string | null;
  mpv: MpvClient | null;
}

// ---------------------------------------------------------------------------
// Tool definitions + handlers — built per-call from context
// ---------------------------------------------------------------------------

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
    handler: (params: Record<string, any>, ctx: LlmContext) => Promise<string>;
  };
}

function baseTools(): Tool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_playlists',
        description: 'List all playlists.',
        parameters: { type: 'object', properties: {} },
        handler: async () => {
          const conn = db.connect();
          const rows = db.listPlaylists(conn);
          conn.close();
          if (!rows.length) return 'No playlists.';
          return 'Playlists:\n' + rows.map((r) => `  ${r.name}`).join('\n');
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'show_playlist',
        description: 'Show songs in a playlist.',
        parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        handler: async (p) => {
          const conn = db.connect();
          const rows = db.playlistUrls(conn, p.name);
          conn.close();
          if (!rows.length) return `Playlist '${p.name}' is empty or missing.`;
          return `Playlist '${p.name}':\n` + rows.map((r, i) => `  ${i + 1}. ${r.url}  ${r.title || ''}`).join('\n');
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'like_current',
        description: 'Like the currently playing song in the current playlist context.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv || !ctx.playlistName) return 'No playback context.';
          const url = await ctx.mpv.get('path').catch(() => null);
          if (!url) return 'Could not determine current song.';
          const conn = db.connect();
          const created = db.likeSong(conn, ctx.playlistName, url);
          conn.close();
          return created ? `Liked ${url} in '${ctx.playlistName}'.` : 'Already liked in this playlist.';
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'show_liked',
        description: 'Show liked songs for the current playlist context.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.playlistName) return 'No playlist context.';
          const conn = db.connect();
          const rows = db.likedSongs(conn, ctx.playlistName);
          conn.close();
          if (!rows.length) return `No liked songs in '${ctx.playlistName}'.`;
          return `Liked in '${ctx.playlistName}':\n` + rows.map((r) => `  ${r.url}  ${r.title || ''}`).join('\n');
        },
      },
    },
  ];
}

function mpvTools(): Tool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'mpv_pause',
        description: 'Toggle pause/resume.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          const paused = await ctx.mpv.get('pause').catch(() => null);
          await ctx.mpv.set('pause', !paused);
          return !paused ? 'Paused.' : 'Resumed.';
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_next',
        description: 'Skip to next song.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          await ctx.mpv.send(['playlist-next', 'force']);
          return 'Skipped.';
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_prev',
        description: 'Go to previous song.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          await ctx.mpv.send(['playlist-prev', 'force']);
          return 'Previous.';
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_mute',
        description: 'Toggle mute.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          const muted = await ctx.mpv.get('mute').catch(() => false);
          await ctx.mpv.set('mute', !muted);
          return !muted ? 'Muted.' : 'Unmuted.';
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_volume',
        description: 'Set volume 0-100.',
        parameters: { type: 'object', properties: { level: { type: 'integer' } }, required: ['level'] },
        handler: async (p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          const v = Math.max(0, Math.min(100, p.level));
          await ctx.mpv.set('volume', v);
          return `Volume: ${v}%.`;
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_seek',
        description: 'Seek by seconds (positive=forward, negative=back).',
        parameters: { type: 'object', properties: { seconds: { type: 'number' } }, required: ['seconds'] },
        handler: async (p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          await ctx.mpv.send(['seek', p.seconds, 'relative']);
          return `Seeked ${p.seconds}s.`;
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mpv_status',
        description: 'Show current song, position, duration, volume.',
        parameters: { type: 'object', properties: {} },
        handler: async (_p, ctx) => {
          if (!ctx.mpv) return 'No playback.';
          const [url, pos, dur, paused, vol, mute] = await Promise.all([
            ctx.mpv.get('path').catch(() => '?'),
            ctx.mpv.get('time-pos').catch(() => 0),
            ctx.mpv.get('duration').catch(() => 0),
            ctx.mpv.get('pause').catch(() => false),
            ctx.mpv.get('volume').catch(() => 100),
            ctx.mpv.get('mute').catch(() => false),
          ]);
          const fmt = (s: number) => { if (!s || s < 0) return '--:--'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
          return `Playing: ${url}\n${fmt(pos)} / ${fmt(dur)}  ${paused ? 'paused' : 'playing'}  vol ${vol}${mute ? ' (muted)' : ''}`;
        },
      },
    },
  ];
}

function buildTools(ctx: LlmContext): Tool[] {
  const tools = [...baseTools()];
  if (ctx.mpv) tools.push(...mpvTools());
  return tools;
}

function buildSystemPrompt(ctx: LlmContext): string {
  let prompt = `You are the imj assistant controlling a local music playlist manager. Be concise.`;
  if (ctx.playlistName) {
    prompt += `\nCurrent playlist context: '${ctx.playlistName}'.`;
  }
  if (ctx.mpv) {
    prompt += `\nPlayback is active. You can control it: pause, next, prev, mute, volume, seek, status. You can also like the current song.`;
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// Ollama API types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface LlmConfig {
  host: string;
  model: string;
}

export const defaultConfig: LlmConfig = {
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'gemma4:latest',
};

// ---------------------------------------------------------------------------
// chat() — tool-calling loop
// ---------------------------------------------------------------------------

export async function chat(
  messages: ChatMessage[],
  ctx: LlmContext,
  cfg: LlmConfig = defaultConfig,
): Promise<string> {
  const tools = buildTools(ctx);
  const systemPrompt = buildSystemPrompt(ctx);
  const allMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  for (let round = 0; round < 8; round++) {
    const res = await callOllama(allMessages, tools, cfg);
    const msg = res.message;
    if (!msg) return '(no response)';

    allMessages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });

    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const name = call.function?.name;
        let args: Record<string, any>;
        try {
          const raw = call.function?.arguments;
          args = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
        } catch { args = {}; }

        const tool = tools.find((t) => t.function.name === name);
        const result = tool
          ? await tool.function.handler(args, ctx).catch((e: Error) => `Error: ${e.message}`)
          : `Unknown tool: ${name}`;

        allMessages.push({ role: 'tool', content: result, tool_call_id: call.id });
      }
      continue;
    }

    return msg.content || '(no response)';
  }

  return '(max rounds reached)';
}

// Strip handlers from tools for the API payload
function serializeTools(tools: Tool[]): any[] {
  return tools.map((t) => ({
    type: t.type,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

async function callOllama(messages: ChatMessage[], tools: Tool[], cfg: LlmConfig): Promise<any> {
  const res = await fetch(`${cfg.host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: serializeTools(tools),
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama API ${res.status}: ${text}`);
  }
  return res.json();
}
