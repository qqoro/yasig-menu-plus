import log from "electron-log";
import { app } from "electron";

const isDev = !app.isPackaged;

log.transports.console.level = isDev ? "debug" : "info";
log.transports.file.level = "info";

log.transports.console.format =
  "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} │ {text}";
log.transports.file.format =
  "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {scope} │ {text}";

export function createLogger(scope: string) {
  return log.scope(scope);
}

export const logger = log;
