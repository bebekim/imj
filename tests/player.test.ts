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
