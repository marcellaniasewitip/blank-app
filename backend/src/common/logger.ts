import pino from 'pino';

/** Structured JSON logs (§12). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'cooper-waters-api' },
  redact: ['req.headers.authorization', '*.password', '*.code', '*.otp', '*.totpSecret', '*.passwordHash'],
  timestamp: pino.stdTimeFunctions.isoTime,
});
