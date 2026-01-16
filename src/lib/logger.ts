/**
 * Simple logger that writes to stdout/stderr
 * No fancy logging libraries - just plain console with timestamps
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private formatMessage(level: LogLevel, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  info(message: string, meta?: Record<string, any>): void {
    console.log(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: Record<string, any>): void {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: Record<string, any>): void {
    console.error(this.formatMessage('error', message, meta));
  }

  debug(message: string, meta?: Record<string, any>): void {
    console.log(this.formatMessage('debug', message, meta));
  }
}

export const logger = new Logger();
