import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as config from '../src/config.js';
import { createIsolatedEnv } from './helper.js';
import { createProgram } from '../src/main.js';

test('configDir uses XDG_CONFIG_HOME when present', () => {
  const env = createIsolatedEnv();
  try {
    assert.strictEqual(config.configDir(), path.join(env.configDir, 'imj'));
  } finally {
    env.cleanup();
  }
});

test('configDir defaults to home .config when XDG is missing', () => {
  const env = createIsolatedEnv();
  // Temporarily delete XDG_CONFIG_HOME
  delete process.env.XDG_CONFIG_HOME;
  try {
    assert.strictEqual(config.configDir(), path.join(env.tempDir, '.config', 'imj'));
  } finally {
    env.cleanup();
  }
});

test('setup writes configuration file correctly', async (t) => {
  const env = createIsolatedEnv();
  const logMock = t.mock.method(console, 'log', () => {});
  try {
    const customMusic = path.join(env.tempDir, 'custom-music');
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'imj', 'setup', '--music-dir', customMusic]);
    
    const cfg = config.loadConfig();
    assert.strictEqual(cfg.music_dir, customMusic);
    assert.strictEqual(cfg.default_playlist, 'default');
    assert.ok(fs.existsSync(config.configPath()));
  } finally {
    env.cleanup();
  }
});

test('musicDir defaults to user Music folder', () => {
  const env = createIsolatedEnv();
  try {
    assert.strictEqual(config.musicDir({}), path.join(env.tempDir, 'Music', 'imj'));
  } finally {
    env.cleanup();
  }
});

test('musicDir respects configuration override', () => {
  const custom = '/some/custom/path';
  assert.strictEqual(config.musicDir({ music_dir: custom }), path.resolve(custom));
});

test('slugify cleans up text appropriately', () => {
  assert.strictEqual(config.slugify('Late Night Jazz'), 'late-night-jazz');
  assert.strictEqual(config.slugify('study'), 'study');
  assert.strictEqual(config.slugify('  Foo Bar!! '), 'foo-bar');
});
