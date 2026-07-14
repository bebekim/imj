import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface IsolatedEnv {
  tempDir: string;
  configDir: string;
  musicDir: string;
  cleanup: () => void;
}

export function createIsolatedEnv(): IsolatedEnv {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imj-test-'));
  const configDir = path.join(tempDir, 'config');
  const musicDir = path.join(tempDir, 'music');
  
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(musicDir, { recursive: true });

  // Store original env
  const origXdg = process.env.XDG_CONFIG_HOME;
  const origHome = process.env.HOME;

  // Set new isolated env
  process.env.XDG_CONFIG_HOME = configDir;
  process.env.HOME = tempDir;

  const cleanup = () => {
    // Restore env
    if (origXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = origXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    if (origHome !== undefined) {
      process.env.HOME = origHome;
    } else {
      delete process.env.HOME;
    }

    // Remove directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return {
    tempDir,
    configDir,
    musicDir,
    cleanup,
  };
}
