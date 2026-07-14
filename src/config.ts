import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

export const APP_NAME = 'imj';
export const DEFAULT_PLAYLIST = 'default';

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return path.join(xdg, APP_NAME);
  }
  return path.join(os.homedir(), '.config', APP_NAME);
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export function loadConfig(): Record<string, any> {
  const p = configPath();
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(cfg: Record<string, any>): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
}

export function musicDir(cfg?: Record<string, any> | null): string {
  const finalCfg = cfg ?? loadConfig();
  if (finalCfg.music_dir) {
    return path.resolve(finalCfg.music_dir);
  }
  return path.join(os.homedir(), 'Music', APP_NAME);
}

export function dbPath(cfg?: Record<string, any> | null): string {
  return path.join(musicDir(cfg), 'imj.sqlite');
}

export function stagingPath(cfg?: Record<string, any> | null): string {
  return path.join(musicDir(cfg), 'staging.tsv');
}

export function playlistsDir(cfg?: Record<string, any> | null): string {
  return path.join(musicDir(cfg), 'playlists');
}

export function exportPath(name: string, cfg?: Record<string, any> | null): string {
  const slug = slugify(name);
  return path.join(playlistsDir(cfg), `${slug}.txt`);
}

export function slugify(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-');
  // strip leading/trailing hyphens
  if (s.startsWith('-')) s = s.substring(1);
  if (s.endsWith('-')) s = s.substring(0, s.length - 1);
  return s;
}

export function defaultPlaylistName(cfg?: Record<string, any> | null): string {
  const finalCfg = cfg ?? loadConfig();
  return finalCfg.default_playlist ?? DEFAULT_PLAYLIST;
}
