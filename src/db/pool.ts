import pg from 'pg';
import { env } from '../config/env.js';
import { configureNumericTypes } from './types.js';

configureNumericTypes();

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: shouldUseSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
});

function shouldUseSsl(url: string): boolean {
  return !url.includes('localhost') && !url.includes('127.0.0.1');
}