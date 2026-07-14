import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as config from './config.js';
import * as db from './db.js';
import * as staging from './staging.js';
import { player } from './player.js';
import { createBot, runCleanup } from './bot.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('imj')
    .description('imj - local music URL playlist manager with mpv playback (interviews, music, jokes).')
    .version('0.1.0');

  program
    .command('setup')
    .description('Write config. Sets the music directory.')
    .option('--music-dir <path>', 'Music data directory.')
    .action((options) => {
      const cfg = config.loadConfig();
      if (options.musicDir) {
        cfg.music_dir = options.musicDir;
      }
      if (!cfg.default_playlist) {
        cfg.default_playlist = config.DEFAULT_PLAYLIST;
      }
      config.saveConfig(cfg);
      console.log(`Config written to ${config.configPath()}`);
      console.log(`Music directory: ${config.musicDir(cfg)}`);
    });

  program
    .command('create <name>')
    .description('Create a named playlist.')
    .action((name) => {
      const conn = db.connect();
      db.getOrCreatePlaylist(conn, name);
      console.log(`Created playlist '${name}'.`);
      conn.close();
    });

  program
    .command('add <url>')
    .description('Add a URL to the staging file (newest-first). Does not write to SQLite.')
    .option('--playlist <name>', 'Target playlist name.')
    .action((url, options) => {
      const cfg = config.loadConfig();
      const pname = options.playlist || config.defaultPlaylistName(cfg);
      const p = config.stagingPath(cfg);
      const normalized = config.normalizeUrl(url);
      staging.prependEntry(p, normalized, pname);
      console.log(`Staged '${normalized}' for playlist '${pname}'.`);
    });

  program
    .command('import-staging')
    .description('Validate staged entries with mpv, import working non-duplicates, flush them.')
    .action(() => {
      if (!player.mpvAvailable()) {
        console.error('Error: mpv needs to be installed or upgraded.');
        process.exit(1);
      }
      const cfg = config.loadConfig();
      const p = config.stagingPath(cfg);
      const entries = staging.readEntries(p);
      if (entries.length === 0) {
        console.log('No staged entries to import.');
        return;
      }
      const conn = db.connect(cfg);
      const imported: [string, string][] = [];
      const failed: [string, string][] = [];
      const seen = new Set<string>();
      
      for (const [url, pname] of entries) {
        const key = `${url}|||${pname}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        if (!player.validateUrl(url)) {
          failed.push([url, pname]);
          console.log(`FAIL  ${url} (validation)`);
          continue;
        }
        const created = db.addSongToPlaylist(conn, url, pname);
        if (created) {
          imported.push([url, pname]);
          console.log(`OK    ${url} -> ${pname}`);
        } else {
          console.log(`SKIP  ${url} -> ${pname} (already in playlist)`);
        }
      }
      staging.flushEntries(p, imported);
      conn.close();
      console.log(`Imported ${imported.length}, failed ${failed.length}.`);
    });

  program
    .command('playlists')
    .description('List all playlists.')
    .action(() => {
      const conn = db.connect();
      const rows = db.listPlaylists(conn);
      conn.close();
      if (rows.length === 0) {
        console.log('No playlists.');
        return;
      }
      for (const row of rows) {
        console.log(`${row.name}\t${row.slug}`);
      }
    });

  program
    .command('show <name>')
    .description('Print URLs and titles for a playlist.')
    .action((name) => {
      const conn = db.connect();
      const rows = db.playlistUrls(conn, name);
      conn.close();
      if (rows.length === 0) {
        console.log(`Playlist '${name}' is empty or does not exist.`);
        return;
      }
      for (const row of rows) {
        const title = row.title || '';
        console.log(`${row.url}\t${title}`);
      }
    });

  program
    .command('export <name>')
    .description('Write an mpv playlist file for NAME.')
    .option('--output <path>', 'Output file path.')
    .action((name, options) => {
      const cfg = config.loadConfig();
      const conn = db.connect(cfg);
      const rows = db.playlistUrls(conn, name);
      conn.close();
      if (rows.length === 0) {
        console.log(`Playlist '${name}' is empty or does not exist.`);
        return;
      }
      const out = options.output ? path.resolve(options.output) : config.exportPath(name, cfg);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, rows.map((r) => r.url).join('\n') + '\n', 'utf8');
      console.log(`Exported ${rows.length} entries to ${out}`);
    });

  program
    .command('play <name>')
    .description('Play a playlist with mpv (no video, infinite loop).')
    .action((name) => {
      if (!player.mpvAvailable()) {
        console.error('Error: mpv needs to be installed or upgraded.');
        process.exit(1);
      }
      const cfg = config.loadConfig();
      const conn = db.connect(cfg);
      const rows = db.playlistUrls(conn, name);
      conn.close();
      if (rows.length === 0) {
        console.log(`Playlist '${name}' is empty or does not exist.`);
        return;
      }
      const out = config.exportPath(name, cfg);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, rows.map((r) => r.url).join('\n') + '\n', 'utf8');
      player.playPlaylist(out);
    });

  program
    .command('bot-start')
    .description('Start the Telegram Bot daemon.')
    .requiredOption('--token <string>', 'Telegram Bot API token.')
    .requiredOption('--user-id <number>', 'Allowed Telegram user ID.', parseInt)
    .action((options) => {
      const bot = createBot(options.token, options.userId);
      bot.start();
      console.log('Telegram Bot daemon started successfully.');

      setInterval(() => {
        runCleanup(bot);
      }, 3600000);

      runCleanup(bot);
    });

  return program;
}
