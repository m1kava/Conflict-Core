import { loadConfig } from './config';
import { log } from './log';
import { createGameServer } from './server';

const config = loadConfig();
const game = createGameServer(config);
const port = await game.listen();
log('info', 'Conflict Core server listening', { url: `http://localhost:${port}`, clientDir: config.clientDir, version: config.version });

function shutdown(signal: string): void {
  log('info', 'shutting down', { signal });
  game.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
