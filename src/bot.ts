import { Bot, InputFile } from 'grammy';
import * as fs from 'node:fs';
import * as db from './db.js';
import * as config from './config.js';
import * as staging from './staging.js';
import { player } from './player.js';
import { downloader } from './downloader.js';

export function createBot(token: string, allowedUserId: number): Bot {
  // Provide botInfo fallback to bypass getMe API calls in offline test environments
  const bot = new Bot(token, {
    botInfo: {
      id: 123456,
      is_bot: true,
      first_name: 'imj_bot',
      username: 'imj_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false
    } as any
  });

  // Security whitelist middleware
  bot.use((ctx, next) => {
    if (ctx.from?.id !== allowedUserId) {
      console.warn(`Blocked unauthorized access attempt from User ID: ${ctx.from?.id}`);
      return;
    }
    return next();
  });

  bot.command('playlists', async (ctx) => {
    const conn = db.connect();
    try {
      const playlists = db.listPlaylists(conn);
      if (playlists.length === 0) {
        await ctx.reply('No playlists.');
        return;
      }
      const list = playlists.map(p => `• ${p.name}`).join('\n');
      await ctx.reply(`Your Playlists:\n${list}`);
    } finally {
      conn.close();
    }
  });

  bot.command('show', async (ctx) => {
    const name = (ctx.match || '').trim();
    if (!name) {
      await ctx.reply('Please specify a playlist name: /show <playlist>');
      return;
    }
    const conn = db.connect();
    try {
      const rows = db.playlistUrls(conn, name);
      if (rows.length === 0) {
        await ctx.reply(`Playlist '${name}' is empty or does not exist.`);
        return;
      }
      const list = rows.map((r, i) => `${i + 1}. ${r.title || 'Untitled'} (${r.url})`).join('\n');
      await ctx.reply(`Playlist '${name}':\n${list}`);
    } finally {
      conn.close();
    }
  });

  bot.command('add', async (ctx) => {
    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);
    if (parts.length === 0) {
      await ctx.reply('Please specify a URL: /add <url> [--playlist <name>]');
      return;
    }
    const url = parts[0];
    let playlistName = 'default';
    const playlistIdx = parts.indexOf('--playlist');
    if (playlistIdx !== -1 && parts[playlistIdx + 1]) {
      playlistName = parts[playlistIdx + 1];
    }
    const cfg = config.loadConfig();
    const normalized = config.normalizeUrl(url);
    staging.prependEntry(config.stagingPath(cfg), normalized, playlistName);
    await ctx.reply(`Staged '${normalized}' for playlist '${playlistName}'.`);
  });

  bot.command('import', async (ctx) => {
    if (!player.mpvAvailable()) {
      await ctx.reply('Error: mpv needs to be installed or upgraded.');
      return;
    }
    const cfg = config.loadConfig();
    const p = config.stagingPath(cfg);
    const entries = staging.readEntries(p);
    if (entries.length === 0) {
      await ctx.reply('No staged entries to import.');
      return;
    }
    await ctx.reply('Validating staged links...');
    const conn = db.connect(cfg);
    const imported: [string, string][] = [];
    const failed: [string, string][] = [];
    const seen = new Set<string>();
    
    try {
      for (const [url, pname] of entries) {
        const key = `${url}|||${pname}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        if (!player.validateUrl(url)) {
          failed.push([url, pname]);
          await ctx.reply(`FAIL  ${url} (validation)`);
          continue;
        }
        const created = db.addSongToPlaylist(conn, url, pname);
        if (created) {
          imported.push([url, pname]);
          await ctx.reply(`OK: ${url} -> ${pname}`);
        } else {
          await ctx.reply(`SKIP  ${url} -> ${pname} (already in playlist)`);
        }
      }
      staging.flushEntries(p, imported);
      await ctx.reply(`Imported ${imported.length} links to SQLite.`);
    } finally {
      conn.close();
    }
  });

  bot.command('play', async (ctx) => {
    const name = (ctx.match || '').trim() || 'default';
    const cfg = config.loadConfig();
    const conn = db.connect(cfg);
    try {
      const rows = db.playlistUrls(conn, name);
      if (rows.length === 0) {
        await ctx.reply(`Playlist '${name}' is empty or does not exist.`);
        return;
      }
      await ctx.reply(`Downloading playlist '${name}' (${rows.length} tracks)...`);
      for (const row of rows) {
        try {
          const uniqueId = `song_${config.slugify(name)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const filePath = downloader.downloadAudio(row.url, uniqueId);
          const msg = await ctx.replyWithAudio(new InputFile(filePath), {
            title: row.title || undefined
          });
          
          db.recordSentMessage(conn, msg.message_id, ctx.chat.id, new Date().toISOString());
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err: any) {
          await ctx.reply(`Failed to play song ${row.url}: ${err.message}`);
        }
      }
    } finally {
      conn.close();
    }
  });

  return bot;
}

export async function runCleanup(bot: Bot): Promise<void> {
  const conn = db.connect();
  try {
    const expired = db.getExpiredSentMessages(conn);
    for (const msg of expired) {
      try {
        await bot.api.deleteMessage(msg.chat_id, msg.message_id);
      } catch {
        // Continue even if telegram deletion fails (e.g. message already deleted by user)
      }
      db.deleteSentMessageRecord(conn, msg.message_id, msg.chat_id);
    }
  } catch (err) {
    console.error('Error running cleanup:', err);
  } finally {
    conn.close();
  }
}
