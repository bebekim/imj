import * as fs from 'node:fs';
import * as path from 'node:path';

export function readEntries(p: string): [string, string][] {
  if (!fs.existsSync(p)) {
    return [];
  }
  const content = fs.readFileSync(p, 'utf8');
  const entries: [string, string][] = [];
  for (const line of content.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    if (!line.includes('\t')) {
      continue;
    }
    const [url, playlist] = line.split('\t');
    entries.push([url.trim(), playlist.trim()]);
  }
  return entries;
}

export function prependEntry(p: string, url: string, playlist: string): void {
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const line = `${url}\t${playlist}\n`;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, line + existing, 'utf8');
}

export function flushEntries(p: string, toRemove: [string, string][]): void {
  if (!fs.existsSync(p)) {
    return;
  }
  const removeSet = new Set(toRemove.map(([u, pr]) => `${u.trim()}|||${pr.trim()}`));
  const content = fs.readFileSync(p, 'utf8');
  const kept: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) {
      kept.push(line);
      continue;
    }
    if (!line.includes('\t')) {
      kept.push(line);
      continue;
    }
    const [url, playlist] = line.split('\t');
    const key = `${url.trim()}|||${playlist.trim()}`;
    if (removeSet.has(key)) {
      continue;
    }
    kept.push(line);
  }
  
  // Reconstruct file, keeping empty lines/trailing newlines cleanly
  fs.writeFileSync(p, kept.join('\n') + (kept.length > 0 && !kept[kept.length - 1].endsWith('\n') ? '\n' : ''), 'utf8');
}
