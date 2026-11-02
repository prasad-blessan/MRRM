import pino from 'pino';
import { isProduction } from './config.js';

// Logs carry IDs and error codes only, never document content or personal data (INT-09).
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.code'],
    remove: true,
  },
  ...(isProduction ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
