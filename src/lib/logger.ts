import * as Config from './config';
import winston from 'winston';
import util from 'node:util';

const stripSymbols = (anyObj: unknown): unknown => {
  return typeof anyObj === 'object' &&
    anyObj !== null &&
    Object.keys(anyObj).length &&
    !Array.isArray(anyObj)
    ? Object.fromEntries(Object.entries(anyObj))
    : anyObj;
};

const inspectObj = (anyObj: unknown): string => {
  if (typeof anyObj === 'string') return anyObj;
  const obj = stripSymbols(anyObj);
  return util.inspect(obj, { depth: null, colors: true, compact: Config.CI });
};

const winstonLevelColorsExt = Object.fromEntries(
  Object.entries(winston.config.npm.colors).map(([level, color]) => [
    level.toUpperCase(),
    color,
  ])
);

winston.addColors(winstonLevelColorsExt);

export const logger = winston.createLogger({
  level: Config.NODE_ENV === 'production' ? 'http' : 'silly',
  transports: [new winston.transports.Console()],
  silent: Config.NODE_ENV === 'test',
  format: winston.format.combine(
    winston.format((info) => {
      info.level = info.level.toUpperCase();
      return info;
    })(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ level: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] ${level}: ${inspectObj(message)}${
        Object.keys(meta).length ? '\n' + inspectObj(meta) : ''
      }`;
    })
  ),
});

if (!Config.CI) {
  logger.add(
    new winston.transports.File({
      tailable: true,
      filename: 'logs/app.log',
      format: winston.format.json(),
      maxsize: 1024 * 1024 * 5, // 5MB
      maxFiles: 3,
    })
  );
}

export default logger;
