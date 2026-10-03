type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env['LOG_LEVEL'] as Level | undefined) ?? 'info'] ?? ORDER.info;

/** Structured JSON-lines logging (one object per line) so logs are machine-searchable in any host. */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < threshold || process.env['VITEST']) {
    return;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}
