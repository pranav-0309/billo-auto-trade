import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const tz = process.env.TZ ?? 'Asia/Dubai';

function formatTimeInTz(): string {
  const formatted = new Date().toLocaleString('en-GB', {
    timeZone: tz,
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
  level,
  timestamp: formatTimeInTz,
});

export default logger;
