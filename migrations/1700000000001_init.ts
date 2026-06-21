import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  const sql = readFileSync(
    join(process.cwd(), 'sql/migrations/001_init.sql'),
    'utf8',
  );
  await pgm.sql(sql);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  const sql = readFileSync(
    join(process.cwd(), 'sql/migrations/001_init.down.sql'),
    'utf8',
  );
  await pgm.sql(sql);
}