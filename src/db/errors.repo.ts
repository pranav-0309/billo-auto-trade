import type { ErrorRow, Executor } from './types.js';

export async function recordError(
  executor: Executor,
  input: { message: string; stack?: string | null; signalId?: string | null },
): Promise<ErrorRow> {
  const result = await executor.query<ErrorRow>(
    `INSERT INTO errors (signal_id, message, stack)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.signalId ?? null, input.message, input.stack ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new Error('recordError: expected RETURNING to return a row');
  return row;
}
