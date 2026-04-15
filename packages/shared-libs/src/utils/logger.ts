/**
 * Secure logging utilities to prevent log injection attacks (CWE-117)
 */

export function sanitizeForLog(input: unknown): string {
  if (input === null || input === undefined) return 'null';
  return String(input).replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').trim();
}

export function safeLog(...args: unknown[]): void {
  console.log(...args.map(sanitizeForLog));
}

export function safeError(...args: unknown[]): void {
  console.error(...args.map(sanitizeForLog));
}
