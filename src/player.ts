import { spawnSync, execSync } from 'node:child_process';

// Mockable dependencies object for unit testing subprocesses
export const deps = {
  execSync,
  spawnSync,
};

export function mpvAvailable(): boolean {
  try {
    deps.execSync('which mpv', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function validateUrl(url: string, timeoutMs: number = 20000): boolean {
  if (!mpvAvailable()) {
    return false;
  }
  try {
    const result = deps.spawnSync('mpv', ['--no-video', '--length=10', url], {
      timeout: timeoutMs,
      stdio: 'ignore',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function playPlaylist(playlistFile: string): number {
  if (!mpvAvailable()) {
    throw new Error('mpv needs to be installed or upgraded.');
  }
  const result = deps.spawnSync('mpv', ['--no-video', '--loop-playlist=inf', `--playlist=${playlistFile}`], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

// Group into a mockable player object
export const player = {
  mpvAvailable,
  validateUrl,
  playPlaylist,
};
