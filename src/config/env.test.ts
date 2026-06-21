import { describe, it, expect, beforeEach, vi } from 'vitest';

const REQUIRED = {
  DATABASE_URL: 'postgres://test@localhost:5432/test',
  TELEGRAM_API_ID: '12345',
  TELEGRAM_API_HASH: 'hash',
  TELEGRAM_SESSION_STRING: 'session',
  TELEGRAM_CHANNEL_ID: '-100123',
  TELEGRAM_OWNER_CHAT_ID: 'me',
  MT5_LOGIN: 'login',
  MT5_PASSWORD: 'pw',
  MT5_SERVER: 'VTMarkets-Demo',
  METAAPI_TOKEN: 'tok',
  METAAPI_ACCOUNT_ID: 'acct',
};

const ENV_KEYS = [
  ...Object.keys(REQUIRED),
  'TELEGRAM_ADMIN_USER_ID',
  'PLATFORM_LABEL',
  'LOT_SIZE',
  'MAGIC_NUMBER',
  'MT5_INTEGRATION',
  'KILL_SWITCH',
  'DRY_RUN',
  'LOG_LEVEL',
  'TZ',
  'NODE_ENV',
];

function setValidEnv(): void {
  for (const [k, v] of Object.entries(REQUIRED)) {
    process.env[k] = v;
  }
}

beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
});

describe('env loader', () => {
  it('accepts a full valid env and returns typed values', async () => {
    setValidEnv();
    const { env } = await import('./env.js');
    expect(env.DATABASE_URL).toBe('postgres://test@localhost:5432/test');
    expect(env.TELEGRAM_API_ID).toBe('12345');
    expect(env.PLATFORM_LABEL).toBe('MT5'); // default
    expect(env.LOT_SIZE).toBe(0.01); // default
    expect(env.LOG_LEVEL).toBe('info'); // default
    expect(env.TZ).toBe('Asia/Dubai'); // default
    expect(env.MT5_INTEGRATION).toBe('metaapi'); // default
    expect(env.DRY_RUN).toBe(false); // default
    expect(env.KILL_SWITCH).toBe(false); // default
  });

  it('throws with a clear message when DATABASE_URL is missing', async () => {
    setValidEnv();
    delete process.env.DATABASE_URL;
    await expect(import('./env.js')).rejects.toThrow(/DATABASE_URL/);
  });

  it('throws when TELEGRAM_API_ID is missing', async () => {
    setValidEnv();
    delete process.env.TELEGRAM_API_ID;
    await expect(import('./env.js')).rejects.toThrow(/TELEGRAM_API_ID/);
  });

  it('coerces LOT_SIZE and MAGIC_NUMBER strings to numbers', async () => {
    setValidEnv();
    process.env.LOT_SIZE = '0.05';
    process.env.MAGIC_NUMBER = '123456';
    const { env } = await import('./env.js');
    expect(env.LOT_SIZE).toBe(0.05);
    expect(typeof env.LOT_SIZE).toBe('number');
    expect(env.MAGIC_NUMBER).toBe(123456);
    expect(typeof env.MAGIC_NUMBER).toBe('number');
  });

  it('throws when LOT_SIZE is not a number', async () => {
    setValidEnv();
    process.env.LOT_SIZE = 'not-a-number';
    await expect(import('./env.js')).rejects.toThrow(/LOT_SIZE/);
  });

  it('coerces DRY_RUN and KILL_SWITCH from truthy/falsy strings', async () => {
    setValidEnv();
    process.env.DRY_RUN = 'true';
    process.env.KILL_SWITCH = '1';
    const { env } = await import('./env.js');
    expect(env.DRY_RUN).toBe(true);
    expect(env.KILL_SWITCH).toBe(true);
  });

  it('treats DRY_RUN="false" as false', async () => {
    setValidEnv();
    process.env.DRY_RUN = 'false';
    const { env } = await import('./env.js');
    expect(env.DRY_RUN).toBe(false);
  });

  it('leaves TELEGRAM_ADMIN_USER_ID undefined when unset', async () => {
    setValidEnv();
    delete process.env.TELEGRAM_ADMIN_USER_ID;
    const { env } = await import('./env.js');
    expect(env.TELEGRAM_ADMIN_USER_ID).toBeUndefined();
  });

  it('respects an overridden TZ', async () => {
    setValidEnv();
    process.env.TZ = 'UTC';
    const { env } = await import('./env.js');
    expect(env.TZ).toBe('UTC');
  });
});
