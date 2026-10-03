/// <reference lib="webworker" />
/**
 * Offline mode: the authoritative game server's lobby and match loop, running in a Web Worker on the
 * player's device. It is the same code the Node server runs, fed by the same validated protocol, so AI
 * matches behave identically to hosted ones — only online opponents are unavailable.
 */
import { parseClientMessage } from '@conflict/shared';
import { Lobby } from '../../../server/src/lobby';
import type { Peer, Session } from '../../../server/src/session';
import type { WorkerOutbound } from './transport';

declare const self: DedicatedWorkerGlobalScope;

const post = (message: WorkerOutbound, transfer: Transferable[] = []): void => self.postMessage(message, transfer);

const lobby = new Lobby({ version: 'offline', maxMatches: 2 });
const peer: Peer = {
  sendJson: (message) => post({ json: JSON.stringify(message) }),
  sendBinary: (data) => {
    const copy = data.slice();
    post({ binary: copy.buffer }, [copy.buffer]);
  },
  close: (code) => post({ close: code }),
};
let session: Session | null = null;

self.onmessage = (event: MessageEvent<string>) => {
  const message = parseClientMessage(event.data);
  if (!message) {
    return;
  }
  if (!session) {
    session = lobby.hello(peer, message);
    return;
  }
  lobby.handle(session, message);
};
