import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Expose internal deps for unit testing
export const deps = {
  spawnSync,
};

export function getCacheDir(): string {
  return path.join(os.tmpdir(), 'imj-cache');
}

export function downloadAudio(url: string, uniqueId: string): string {
  const cacheDir = getCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const outputPattern = path.join(cacheDir, `${uniqueId}.%(ext)s`);
  const finalPath = path.join(cacheDir, `${uniqueId}.mp3`);

  if (fs.existsSync(finalPath)) {
    try {
      fs.unlinkSync(finalPath);
    } catch {}
  }

  const result = deps.spawnSync('yt-dlp', [
    '-x',
    '--audio-format', 'mp3',
    '-o', outputPattern,
    url
  ], {
    stdio: 'ignore',
  });

  if (result.status !== 0) {
    throw new Error(`yt-dlp failed to download URL: ${url}`);
  }

  if (!fs.existsSync(finalPath)) {
    throw new Error(`Expected downloaded audio file not found: ${finalPath}`);
  }

  return finalPath;
}

export const downloader = {
  downloadAudio,
  getCacheDir,
};
