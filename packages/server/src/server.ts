import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseClientMessage } from '@conflict/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerConfig } from './config';
import { Lobby } from './lobby';
import { log } from './log';
import { RateLimiter } from './rateLimiter';
import type { Peer, Session } from './session';
import { SECURITY_HEADERS, serveStatic } from './staticFiles';

const MAX_MESSAGE_BYTES = 16 * 1024;
const MESSAGES_PER_SECOND = 60;
const MESSAGE_BURST = 120;
const HEARTBEAT_MS = 15_000;
const SWEEP_MS = 60_000;

export interface GameServer {
  readonly lobby: Lobby;
  readonly http: Server;
  listen(): Promise<number>;
  close(): Promise<void>;
}

/** HTTP (static client + health) and WebSocket game endpoint on one port. */
export function createGameServer(config: ServerConfig): GameServer {
  const lobby = new Lobby({ version: config.version, maxMatches: config.maxMatches, devTools: config.devTools });

  const server = createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      response.end(JSON.stringify({ ok: true, version: config.version, sessions: lobby.sessionCount, matches: lobby.matches.size }));
      return;
    }
    serveStatic(config.clientDir, request, response).catch((error: unknown) => {
      log('error', 'static file error', { error: String(error) });
      if (!response.headersSent) {
        response.writeHead(500).end();
      }
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

  wss.on('connection', (socket: WebSocket, request) => {
    if (wss.clients.size > config.maxConnections) {
      socket.close(1013, 'Server full');
      return;
    }
    const peer: Peer = {
      sendJson: (message) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      },
      sendBinary: (data) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data, { binary: true });
        }
      },
      close: (code, reason) => socket.close(code, reason),
    };
    const limiter = new RateLimiter(MESSAGE_BURST, MESSAGES_PER_SECOND, Date.now());
    let session: Session | null = null;
    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, HEARTBEAT_MS);

    socket.on('message', (data, isBinary) => {
      if (isBinary || !limiter.tryTake(Date.now())) {
        socket.close(1008, isBinary ? 'Binary not accepted' : 'Rate limit exceeded');
        return;
      }
      const message = parseClientMessage(data.toString());
      if (!message) {
        peer.sendJson({ t: 'error', code: 'badMessage', message: 'Malformed message.' });
        return;
      }
      try {
        if (!session) {
          session = lobby.hello(peer, message);
          if (session) {
            log('info', 'client connected', { session: session.id, ip: request.socket.remoteAddress });
          }
          return;
        }
        lobby.handle(session, message);
      } catch (error) {
        log('error', 'message handling failed', { error: String((error as Error).stack ?? error) });
        peer.sendJson({ t: 'error', code: 'internal', message: 'Something went wrong on the server.' });
      }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      if (session) {
        lobby.disconnected(session, peer);
      }
    });
    socket.on('error', (error) => log('warn', 'socket error', { error: String(error) }));
  });

  const sweep = setInterval(() => lobby.sweep(), SWEEP_MS);
  sweep.unref();

  return {
    lobby,
    http: server,
    listen: () =>
      new Promise((resolve) => {
        server.listen(config.port, config.host, () => resolve((server.address() as AddressInfo).port));
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweep);
        for (const match of [...lobby.matches]) {
          match.dispose();
        }
        for (const client of wss.clients) {
          client.close(1012, 'Server restarting');
        }
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
