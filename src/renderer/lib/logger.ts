import log from "electron-log/renderer";

export function createLogger(scope: string) {
  return log.scope(`renderer:${scope}`);
}

export const logger = log;
