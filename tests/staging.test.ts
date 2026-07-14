import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createIsolatedEnv } from './helper.js';
import * as staging from '../src/staging.js';
import * as config from '../src/config.js';

test('prependEntry inserts newest first', () => {
  const env = createIsolatedEnv();
  try {
    const p = config.stagingPath();
    staging.prependEntry(p, 'https://url1', 'study');
    staging.prependEntry(p, 'https://url2', 'chill');
    
    const entries = staging.readEntries(p);
    assert.deepStrictEqual(entries, [
      ['https://url2', 'chill'],
      ['https://url1', 'study']
    ]);
  } finally {
    env.cleanup();
  }
});

test('readEntries ignores blank lines and comments', () => {
  const env = createIsolatedEnv();
  try {
    const p = config.stagingPath();
    fs.mkdirSync(config.musicDir(), { recursive: true });
    fs.writeFileSync(p, 
      '# a comment\n' +
      '\n' +
      'https://url1\tstudy\n' +
      'https://url2\tchill\n',
      'utf8'
    );
    
    const entries = staging.readEntries(p);
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual(entries[0], ['https://url1', 'study']);
  } finally {
    env.cleanup();
  }
});

test('flushEntries removes only imported ones', () => {
  const env = createIsolatedEnv();
  try {
    const p = config.stagingPath();
    fs.mkdirSync(config.musicDir(), { recursive: true });
    fs.writeFileSync(p, 
      'https://good\tstudy\n' +
      'https://bad\tstudy\n' +
      'https://good2\tchill\n',
      'utf8'
    );
    
    staging.flushEntries(p, [
      ['https://good', 'study'],
      ['https://good2', 'chill']
    ]);
    
    const remaining = staging.readEntries(p);
    assert.deepStrictEqual(remaining, [
      ['https://bad', 'study']
    ]);
  } finally {
    env.cleanup();
  }
});

test('flushEntries preserves comment lines', () => {
  const env = createIsolatedEnv();
  try {
    const p = config.stagingPath();
    fs.mkdirSync(config.musicDir(), { recursive: true });
    fs.writeFileSync(p, '# keep me\nhttps://good\tstudy\n', 'utf8');
    
    staging.flushEntries(p, [['https://good', 'study']]);
    
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(text.includes('# keep me'));
  } finally {
    env.cleanup();
  }
});

test('playlist names with spaces are supported', () => {
  const env = createIsolatedEnv();
  try {
    const p = config.stagingPath();
    staging.prependEntry(p, 'https://x', 'Late Night Jazz');
    
    const entries = staging.readEntries(p);
    assert.deepStrictEqual(entries, [
      ['https://x', 'Late Night Jazz']
    ]);
  } finally {
    env.cleanup();
  }
});
