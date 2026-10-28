import { describe, expect, it } from 'vitest';
import { decryptSecrets, encryptSecrets, isEncryptedSecrets } from './backupCrypto';
import { cleanJson, cleanRows, UnsafeImportError } from './sanitizeImport';
import { cleanBaseUrl, hostOf } from '../config/providers';

describe('backup key encryption', () => {
  it('round-trips with the right passphrase and hides the key in the file', async () => {
    const blob = await encryptSecrets({ geminiApiKey: 'AIzaSyExampleExampleExampleExample12345' }, 'correct horse');
    expect(isEncryptedSecrets(blob)).toBe(true);
    expect(JSON.stringify(blob)).not.toContain('AIza');
    expect(await decryptSecrets(blob, 'correct horse')).toEqual({ geminiApiKey: 'AIzaSyExampleExampleExampleExample12345' });
  });

  it('rejects a wrong passphrase and a short one', async () => {
    const blob = await encryptSecrets({ openaiApiKey: 'sk-test-12345678' }, 'correct horse');
    await expect(decryptSecrets(blob, 'wrong passphrase')).rejects.toThrow('Wrong backup passphrase');
    await expect(encryptSecrets({ a: 'b' }, 'short')).rejects.toThrow('at least 8');
  });

  it('refuses unreasonable iteration counts from a hostile file', async () => {
    const blob = await encryptSecrets({ a: 'b' }, 'correct horse');
    await expect(decryptSecrets({ ...blob, iter: 900_000_000 }, 'correct horse')).rejects.toThrow('unsupported');
  });
});

describe('import sanitising', () => {
  it('removes prototype-poisoning keys at any depth', () => {
    const hostile = JSON.parse('{"id":"a","__proto__":{"admin":true},"x":{"constructor":{"y":1},"ok":2}}');
    const clean = cleanJson(hostile) as Record<string, unknown>;
    expect(Object.keys(clean).sort()).toEqual(['id', 'x']);
    expect(clean.x).toEqual({ ok: 2 });
    expect(({} as Record<string, unknown>).admin).toBe(undefined);
  });

  it('rejects absurd nesting', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 100; i++) deep = { a: deep };
    expect(() => cleanJson(deep)).toThrow(UnsafeImportError);
  });

  it('requires a record with a string primary key', () => {
    expect(cleanRows('t', [{ id: 'a', n: 1 }], 'id')).toEqual([{ id: 'a', n: 1 }]);
    expect(() => cleanRows('t', [{ n: 1 }], 'id')).toThrow('invalid "id"');
    expect(() => cleanRows('t', [{ id: 5 }], 'id')).toThrow('invalid "id"');
    expect(() => cleanRows('t', ['text'], 'id')).toThrow('not a record');
  });
});

describe('base URL checks', () => {
  it('still accepts https and localhost http, still rejects other http', () => {
    expect(cleanBaseUrl('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/api/v1');
    expect(cleanBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(cleanBaseUrl('http://example.com/v1')).toBe('');
    expect(cleanBaseUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects addresses that carry credentials, and a host-lookalike trick', () => {
    expect(cleanBaseUrl('https://user:pass@example.com/v1')).toBe('');
    expect(cleanBaseUrl('http://localhost@evil.com/v1')).toBe('');
    expect(hostOf('https://api.openai.com/v1')).toBe('api.openai.com');
  });
});
