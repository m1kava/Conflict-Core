import type { ServerMessage } from '@conflict/shared';
import type { Match } from './match';

/** Transport-agnostic outbound channel to one client (a WebSocket in production, a fake in tests). */
export interface Peer {
  sendJson(message: ServerMessage): void;
  sendBinary(data: Uint8Array): void;
  close(code: number, reason: string): void;
}

/**
 * A player identity for the lifetime of their browser tab (or longer: the token is kept in localStorage).
 * Survives WebSocket reconnects: a new socket presenting the same token re-attaches to the same session,
 * including its room or running match.
 */
export class Session {
  peer: Peer | null;
  roomCode: string | null = null;
  match: Match | null = null;
  inQueue = false;
  disconnectedAt = 0;

  constructor(
    readonly id: string,
    readonly token: string,
    public name: string,
    peer: Peer,
  ) {
    this.peer = peer;
  }

  get connected(): boolean {
    return this.peer !== null;
  }

  send(message: ServerMessage): void {
    this.peer?.sendJson(message);
  }

  sendBinary(data: Uint8Array): void {
    this.peer?.sendBinary(data);
  }
}
