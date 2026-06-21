import pino from 'pino';
import { env } from '../config/env.js';

function formatTimeInTz(): string {
  const formatted = new Date().toLocaleString('en-GB', {
    timeZone: env.TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `,"time":"${formatted}"`;
}

const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: formatTimeInTz,
});

export default logger;
