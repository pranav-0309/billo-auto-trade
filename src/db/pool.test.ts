import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test@localhost:5432/test',
    LOG_LEVEL: 'info',
    TZ: 'Asia/Dubai',
  },
}));

vi.mock('./types.js', async () => {
  const actual = await vi.importActual<typeof import('./types.js')>('./types.js');
  return { ...actual, configureNumericTypes: vi.fn() };
});

describe('pool', () => {
  it('exports a pg.Pool instance with the configured DATABASE_URL', async () => {
    const { pool } = await import('./pool.js');
    expect(pool).toBeDefined();
    expect((pool as unknown as { options: { connectionString: string } }).options.connectionString).toBe(
      'postgres://test@localhost:5432/test',
    );
  });

  it('calls configureNumericTypes once at module load', async () => {
    const { configureNumericTypes } = await import('./types.js');
    expect(configureNumericTypes).toHaveBeenCalledTimes(1);
  });
});