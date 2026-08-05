import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
  base: {
    service: "bareskrim-rekrutmen",
    env: process.env.NODE_ENV,
  },
   formatters: {
     level: (label: string) => {
       return label;
     },
   },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => logger.debug(meta, msg),
  info: (msg: string, meta?: Record<string, unknown>) => logger.info(meta, msg),
  warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(meta, msg),
  error: (msg: string, meta?: Record<string, unknown>) => logger.error(meta, msg),
  fatal: (msg: string, meta?: Record<string, unknown>) => logger.fatal(meta, msg),
  
  // Audit specific loggers
  audit: {
    admin: (action: string, target: string, detail: Record<string, unknown>, userId?: string) =>
      logger.info({ type: "audit_admin", action, target, detail, userId }, `AdminAction: ${action}`),
    student: (userId: string, action: string, periodId: string, detail: Record<string, unknown>) =>
      logger.info({ type: "audit_student", userId, action, periodId, detail }, `Student: ${action}`),
    auth: (event: "login" | "logout" | "verify" | "fail", userId: string, detail?: Record<string, unknown>) =>
      logger.info({ type: "audit_auth", event, userId, detail }, `Auth: ${event}`),
    discord: (event: "role_assign" | "role_remove" | "dm_send" | "webhook", success: boolean, detail: Record<string, unknown>) =>
      logger.info({ type: "audit_discord", event, success, detail }, `Discord: ${event} ${success ? "ok" : "failed"}`),
  },
  
  // Performance timing
  time: (label: string) => logger.time(label),
  timeEnd: (label: string) => logger.timeEnd(label),
  
  // HTTP request logging
  http: (method: string, url: string, status: number, durationMs: number, userId?: string) =>
    logger.info({ type: "http", method, url, status, durationMs, userId }, `${method} ${url} ${status} ${durationMs}ms`),
};

export default logger;