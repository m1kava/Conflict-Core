import { PROTOCOL_VERSION, decodeSnapshot, type ClientMessage, type Command, type DecodedSnapshot, type ServerMessage } from '@conflict/shared';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface ConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onSnapshot(snapshot: DecodedSnapshot): void;
  onState(state: ConnectionState): void;
  onFatal(message: string): void;
}

const TOKEN_KEY = 'conflict.token';
const MAX_BACKOFF_MS = 5000;
const PING_INTERVAL_MS = 2000;
const RESEND_BUFFER = 64;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * WebSocket client with automatic reconnection. The session token (localStorage) lets the server re-attach
 * this browser to its room or running match after Wi-Fi ↔ mobile switches or brief outages. Commands carry
 * sequence numbers; unacknowledged ones are resent after a reconnect and deduplicated by the server.
 */
export class Connection {
  state: ConnectionState = 'offline';
  rttMs = 0;
  bytesIn = 0;
  private socket: WebSocket | null = null;
  private attempts = 0;
  private seq = 0;
  private unacked: { seq: number; command: Command }[] = [];
  private pingTimer = 0;
  private stopped = false;
  private name = 'Commander';

  constructor(private readonly handlers: ConnectionHandlers) {}

  connect(name: string): void {
    this.name = name;
    this.stopped = false;
    this.open();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** Sends a player command; kept until the server confirms it via `lastCommandSeq`. */
  command(command: Command): void {
    const seq = ++this.seq;
    this.unacked.push({ seq, command });
    if (this.unacked.length > RESEND_BUFFER) {
      this.unacked.shift();
    }
    this.send({ t: 'command', seq, command });
  }

  /** Server confirmed every command up to `seq`. */
  acknowledge(seq: number): void {
    if (seq > this.seq) {
      // Server remembers a later sequence from a previous page load: continue above it.
      this.seq = seq;
    }
    this.unacked = this.unacked.filter((c) => c.seq > seq);
  }

  resendUnacknowledged(): void {
    for (const pending of this.unacked) {
      this.send({ t: 'command', seq: pending.seq, command: pending.command });
    }
  }

  close(): void {
    this.stopped = true;
    window.clearInterval(this.pingTimer);
    this.socket?.close();
    this.setState('offline');
  }

  private open(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.setState(this.attempts === 0 ? 'connecting' : 'reconnecting');

    socket.onopen = () => {
      this.attempts = 0;
      const token = storage()?.getItem(TOKEN_KEY) ?? undefined;
      socket.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION, name: this.name, ...(token ? { token } : {}) }));
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', time: performance.now() }), PING_INTERVAL_MS);
    };
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === 'string') {
        this.bytesIn += event.data.length;
        this.handleJson(event.data);
      } else {
        this.bytesIn += event.data.byteLength;
        try {
          this.handlers.onSnapshot(decodeSnapshot(event.data));
        } catch (error) {
          console.error('Bad snapshot', error);
        }
      }
    };
    socket.onclose = (event) => {
      window.clearInterval(this.pingTimer);
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      if (this.stopped || event.code === 4001) {
        this.setState('offline');
        return;
      }
      this.attempts++;
      this.setState('reconnecting');
      const delay = Math.min(MAX_BACKOFF_MS, 250 * 2 ** Math.min(this.attempts, 5));
      window.setTimeout(() => this.open(), delay);
    };
  }

  private handleJson(text: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    switch (message.t) {
      case 'welcome':
        storage()?.setItem(TOKEN_KEY, message.token);
        this.setState('online');
        break;
      case 'pong':
        this.rttMs = performance.now() - message.time;
        break;
      case 'error':
        if (message.code === 'versionMismatch') {
          this.handlers.onFatal(message.message);
        }
        break;
    }
    this.handlers.onMessage(message);
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.handlers.onState(state);
    }
  }
}
