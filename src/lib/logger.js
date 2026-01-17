"use strict";
/**
 * Simple logger that writes to stdout/stderr
 * No fancy logging libraries - just plain console with timestamps
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    formatMessage(level, message, meta) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    }
    info(message, meta) {
        console.log(this.formatMessage('info', message, meta));
    }
    warn(message, meta) {
        console.warn(this.formatMessage('warn', message, meta));
    }
    error(message, meta) {
        console.error(this.formatMessage('error', message, meta));
    }
    debug(message, meta) {
        console.log(this.formatMessage('debug', message, meta));
    }
}
exports.logger = new Logger();
