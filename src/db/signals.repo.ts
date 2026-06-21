import type { Executor, SignalRow } from './types.js';

const UNIQUE_VIOLATION = '23505';

export async function insertSignal(
  executor: Executor,
  input: {
    telegramMessageId: number;
    chatId: string;
    senderUserId: number;
    rawText: string;
  },
): Promise<SignalRow> {
  try {
    const result = await executor.query<SignalRow>(
      `INSERT INTO signals (telegram_message_id, chat_id, sender_user_id, raw_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.telegramMessageId, input.chatId, input.senderUserId, input.rawText],
    );
    const row = result.rows[0];
    if (!row) throw new Error('insertSignal: expected RETURNING to return a row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await findByTelegramMessageId(
        executor,
        input.chatId,
        input.telegramMessageId,
      );
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getSignalById(
  executor: Executor,
  id: string,
): Promise<SignalRow | null> {
  const result = await executor.query<SignalRow>(
    'SELECT * FROM signals WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByTelegramMessageId(
  executor: Executor,
  chatId: string,
  telegramMessageId: number,
): Promise<SignalRow | null> {
  const result = await executor.query<SignalRow>(
    'SELECT * FROM signals WHERE chat_id = $1 AND telegram_message_id = $2',
    [chatId, telegramMessageId],
  );
  return result.rows[0] ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
