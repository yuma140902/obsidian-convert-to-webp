const PREFIX = "[Convert to WebP]";

export function debugLog(message: string, details?: unknown): void {
  if (details === undefined) console.log(`${PREFIX} ${message}`);
  else console.log(`${PREFIX} ${message}`, details);
}

export function debugError(message: string, error: unknown): void {
  console.error(`${PREFIX} ${message}`, error);
}
