import type { Executor, ParseResultRow } from './types.js';

export async function insertParseResult(
  executor: Executor,
  input: {
    signalId: string;
    outcome: 'ok' | 'rejected';
    rejectionReason?: string | null;
    direction?: 'BUY' | 'SELL' | null;
    pairRaw?: string | null;
    pairNormalized?: string | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
    executionPrice?: number | null;
  },
): Promise<ParseResultRow> {
  const result = await executor.query<ParseResultRow>(
    `INSERT INTO parse_results (
       signal_id, outcome, rejection_reason, direction,
       pair_raw, pair_normalized, sl, tp1, tp2, tp3, execution_price
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.signalId,
      input.outcome,
      input.rejectionReason ?? null,
      input.direction ?? null,
      input.pairRaw ?? null,
      input.pairNormalized ?? null,
      input.sl ?? null,
      input.tp1 ?? null,
      input.tp2 ?? null,
      input.tp3 ?? null,
      input.executionPrice ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertParseResult: expected RETURNING to return a row');
  return row;
}

export async function getBySignalId(
  executor: Executor,
  signalId: string,
): Promise<ParseResultRow[]> {
  const result = await executor.query<ParseResultRow>(
    'SELECT * FROM parse_results WHERE signal_id = $1 ORDER BY parsed_at ASC, id ASC',
    [signalId],
  );
  return result.rows;
}
