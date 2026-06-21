import type { Executor, TradeAttemptRow } from './types.js';

export async function insertTradeAttempt(
  executor: Executor,
  input: {
    signalId: string;
    parseResultId: string;
    status: TradeAttemptRow['status'];
    lotSize: number;
    requestedSymbol: string;
  },
): Promise<TradeAttemptRow> {
  const result = await executor.query<TradeAttemptRow>(
    `INSERT INTO trade_attempts
       (signal_id, parse_result_id, status, lot_size, requested_symbol)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.signalId, input.parseResultId, input.status, input.lotSize, input.requestedSymbol],
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertTradeAttempt: expected RETURNING to return a row');
  return row;
}

export async function updateTradeAttemptStatus(
  executor: Executor,
  id: string,
  patch: Partial<
    Pick<
      TradeAttemptRow,
      | 'status'
      | 'broker_ticket'
      | 'filled_symbol'
      | 'filled_price'
      | 'raw_error'
      | 'completed_at'
    >
  >,
): Promise<TradeAttemptRow> {
  const fields = Object.keys(patch) as (keyof typeof patch)[];
  if (fields.length === 0) {
    throw new Error('updateTradeAttemptStatus: patch must include at least one field');
  }
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => patch[f] ?? null);
  const result = await executor.query<TradeAttemptRow>(
    `UPDATE trade_attempts SET ${setClauses} WHERE id = $1 RETURNING *`,
    [id, ...values],
  );
  if (result.rows.length === 0) {
    throw new Error(`updateTradeAttemptStatus: no row with id ${id}`);
  }
  const row = result.rows[0];
  if (!row) throw new Error('updateTradeAttemptStatus: row vanished after existence check');
  return row;
}

export async function getBySignalId(
  executor: Executor,
  signalId: string,
): Promise<TradeAttemptRow[]> {
  const result = await executor.query<TradeAttemptRow>(
    'SELECT * FROM trade_attempts WHERE signal_id = $1 ORDER BY attempted_at ASC, id ASC',
    [signalId],
  );
  return result.rows;
}
