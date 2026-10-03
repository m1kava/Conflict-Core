import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  host: string;
  clientDir: string;
  maxConnections: number;
  maxMatches: number;
  version: string;
  /** Enables development-only commands (scripted battles). Never set in production. */
  devTools: boolean;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  return value;
}

/** Configuration from environment variables; nothing environment-specific is compiled in. */
export function loadConfig(): ServerConfig {
  return {
    port: integer('PORT', 8080),
    host: process.env['HOST'] ?? '0.0.0.0',
    clientDir: process.env['CLIENT_DIR'] ?? fileURLToPath(new URL('../../client/dist/', import.meta.url)),
    maxConnections: integer('MAX_CONNECTIONS', 500),
    maxMatches: integer('MAX_MATCHES', 100),
    version: process.env['APP_VERSION'] ?? '0.2.0',
    devTools: process.env['DEV_TOOLS'] === '1',
  };
}
