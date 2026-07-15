import { test } from 'node:test';
import * as assert from 'node:assert';
import { deps } from '../src/player.js';
import * as player from '../src/player.js';

test('validateUrl success when mpv exits 0', (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawnSync', () => ({ status: 0 }));

  assert.strictEqual(player.validateUrl('https://x'), true);
});

test('validateUrl failure when mpv exits non-zero', (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawnSync', () => ({ status: 1 }));

  assert.strictEqual(player.validateUrl('https://x'), false);
});

test('validateUrl failure on timeout or exception', (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawnSync', () => {
    throw new Error('Timeout!');
  });

  assert.strictEqual(player.validateUrl('https://x'), false);
});

test('mpvAvailable returns true/false correctly', (t) => {
  // Test true
  const mockExecSuccess = t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  assert.strictEqual(player.mpvAvailable(), true);
  mockExecSuccess.mock.restore();

  // Test false
  const mockExecFailure = t.mock.method(deps, 'execSync', () => {
    throw new Error('Not found');
  });
  assert.strictEqual(player.mpvAvailable(), false);
  mockExecFailure.mock.restore();
});

test('getDuration returns seconds from yt-dlp output', (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/yt-dlp'));
  t.mock.method(deps, 'spawnSync', () => ({ status: 0, stdout: '247\n' }));

  assert.strictEqual(player.getDuration('https://x'), 247);
});

test('getDuration returns null on yt-dlp failure', (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/yt-dlp'));
  t.mock.method(deps, 'spawnSync', () => ({ status: 1, stdout: '' }));

  assert.strictEqual(player.getDuration('https://x'), null);
});

test('getDuration returns null when yt-dlp not available', (t) => {
  t.mock.method(deps, 'execSync', () => {
    throw new Error('Not found');
  });

  assert.strictEqual(player.getDuration('https://x'), null);
});

test('validateUrlAsync resolves true when mpv exits 0', async (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawn', () => {
    const ee: any = { on: (ev: string, cb: Function) => { if (ev === 'exit') setTimeout(() => cb(0), 0); }, kill: () => {} };
    return ee;
  });

  assert.strictEqual(await player.validateUrlAsync('https://x'), true);
});

test('validateUrlAsync resolves false when mpv exits non-zero', async (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawn', () => {
    const ee: any = { on: (ev: string, cb: Function) => { if (ev === 'exit') setTimeout(() => cb(1), 0); }, kill: () => {} };
    return ee;
  });

  assert.strictEqual(await player.validateUrlAsync('https://x'), false);
});

test('validateUrlAsync resolves false on timeout', async (t) => {
  t.mock.method(deps, 'execSync', () => Buffer.from('/usr/bin/mpv'));
  t.mock.method(deps, 'spawn', () => {
    const ee: any = { on: () => {}, kill: () => {} };
    return ee;
  });

  assert.strictEqual(await player.validateUrlAsync('https://x', 50), false);
});

test('validateUrlAsync resolves false when mpv not available', async (t) => {
  t.mock.method(deps, 'execSync', () => {
    throw new Error('Not found');
  });

  assert.strictEqual(await player.validateUrlAsync('https://x'), false);
});
