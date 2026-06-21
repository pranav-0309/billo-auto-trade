import { describe, it, expect, beforeAll } from 'vitest';
import pg from 'pg';
import { configureNumericTypes } from './types.js';

beforeAll(() => {
  configureNumericTypes();
});

describe('configureNumericTypes', () => {
  it('parses numeric columns to number', () => {
    const parser = pg.types.getTypeParser(1700);
    expect(parser('1.2345')).toBe(1.2345);
    expect(parser('-0.001')).toBe(-0.001);
    expect(parser('')).toBeNull();
  });

  it('parses bigint columns to number', () => {
    const parser = pg.types.getTypeParser(20);
    expect(parser('12345')).toBe(12345);
    expect(parser('')).toBeNull();
  });
});