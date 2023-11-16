import { createLogger, format, transports } from 'winston';

export const makeLogger = (loggerName: string) => {
  return createLogger({
    transports: [new transports.Console()],
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf(({ timestamp, level, message, loggerName }) => {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `[${timestamp}][${level}] ${loggerName}: ${message}`;
      })
    ),
    defaultMeta: {
      loggerName
    },
    level: 'debug'
  });
};
