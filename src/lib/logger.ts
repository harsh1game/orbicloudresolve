export const logger = {
  info: (message: string, meta?: any) => {
    console.log(JSON.stringify({ level: 'info', message, timestamp: new Date(), ...meta }));
  },
  warn: (message: string, meta?: any) => {
    console.log(JSON.stringify({ level: 'warn', message, timestamp: new Date(), ...meta }));
  },
  error: (message: string, meta?: any) => {
    console.error(JSON.stringify({ level: 'error', message, timestamp: new Date(), ...meta }));
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({ level: 'debug', message, timestamp: new Date(), ...meta }));
    }
  },
};
