export const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (...args: unknown[]) => console.warn("[read-frog]", ...args),
  error: (...args: unknown[]) => console.error("[read-frog]", ...args),
}
