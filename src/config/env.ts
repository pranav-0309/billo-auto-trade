import 'dotenv/config';
import { z } from 'zod';

const numericString = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s === undefined || s === '') return defaultValue;
      const n = Number(s);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'not a number' });
        return z.NEVER;
      }
      return n;
    });

const boolString = z
  .string()
  .optional()
  .transform((s) => s === 'true' || s === '1');

const mt5Integration = z
  .enum(['metaapi', 'python-bridge', 'mt5-webrequest'])
  .default('metaapi');

const schema = z.object({
  DATABASE_URL: z.string().url(),
  TELEGRAM_API_ID: z.string().min(1),
  TELEGRAM_API_HASH: z.string().min(1),
  TELEGRAM_SESSION_STRING: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  TELEGRAM_ADMIN_USER_ID: numericString(),
  TELEGRAM_OWNER_CHAT_ID: z.string().min(1),
  PLATFORM_LABEL: z.string().default('MT5'),
  LOT_SIZE: numericString(0.01),
  MAGIC_NUMBER: numericString(778899),
  MT5_LOGIN: z.string().min(1),
  MT5_PASSWORD: z.string().min(1),
  MT5_SERVER: z.string().min(1),
  MT5_INTEGRATION: mt5Integration,
  METAAPI_TOKEN: z.string().min(1),
  METAAPI_ACCOUNT_ID: z.string().min(1),
  KILL_SWITCH: boolString,
  DRY_RUN: boolString,
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  TZ: z.string().default('Asia/Dubai'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  console.error('Invalid environment:', fieldErrors);
  throw new Error(
    `Environment validation failed: ${JSON.stringify(fieldErrors)}`,
  );
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
