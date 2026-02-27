/**
 * Logger utility for selection-ui module
 * Provides consistent console logging with [BraceKit] prefix
 */

const PREFIX = '[BraceKit]';

export const logger = {
  error(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX} ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${PREFIX} ${message}`, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    console.info(`${PREFIX} ${message}`, ...args);
  },

  debug(message: string, ...args: unknown[]): void {
    // Check for development environment safely
    // In Chrome extension context, process.env may not be defined
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    if (isDev) {
      console.debug(`${PREFIX} ${message}`, ...args);
    }
  },
} as const;
