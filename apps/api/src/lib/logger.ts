import pino from 'pino';
import type { Env } from '@upvine/config/env';

export type Logger = pino.Logger;

export function createLogger(env: Env): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    base: { service: 'api' },
    // Gizli bilgiler loglara asla düşmez.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.accessToken',
      ],
      censor: '[redacted]',
    },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  });
}
