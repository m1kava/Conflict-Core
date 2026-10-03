/**
 * One bidirectional channel to a game server. Production uses a WebSocket to the Node server; static hosting
 * (GitHub Pages) runs the same server lobby inside a Web Worker on the player's own device.
 */
export interface Transport {
  onopen: () => void;
  onmessage: (data: string | ArrayBuffer) => void;
  onclose: (code: number) => void;
  readonly open: boolean;
  send(text: string): void;
  close(): void;
}

/** Address of a remote game server for static builds (e.g. `wss://my-game.onrender.com/ws`); empty if none. */
const REMOTE_SERVER: string = import.meta.env.VITE_SERVER_URL ?? '';
/** Static builds (`VITE_STATIC=1`) have no server next to the page. */
const STATIC_BUILD = import.meta.env.VITE_STATIC === '1';

/** True when the game runs entirely in this browser: AI matches only, no online opponents. */
export const OFFLINE_MODE = STATIC_BUILD && REMOTE_SERVER === '';

export function createTransport(): Transport {
  if (OFFLINE_MODE) {
    return new WorkerTransport();
  }
  const url = REMOTE_SERVER || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  return new SocketTransport(url);
}

class SocketTransport implements Transport {
  onopen = (): void => {};
  onmessage = (_data: string | ArrayBuffer): void => {};
  onclose = (_code: number): void => {};
  private readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => this.onopen();
    this.socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => this.onmessage(event.data);
    this.socket.onclose = (event) => this.onclose(event.code);
  }

  get open(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(text: string): void {
    this.socket.send(text);
  }

  close(): void {
    this.socket.close();
  }
}

/** Messages posted by `localServer.worker.ts`. */
export type WorkerOutbound = { json: string } | { binary: ArrayBuffer } | { close: number };

class WorkerTransport implements Transport {
  onopen = (): void => {};
  onmessage = (_data: string | ArrayBuffer): void => {};
  onclose = (_code: number): void => {};
  open = false;
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./localServer.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const data = event.data;
      if ('json' in data) {
        this.onmessage(data.json);
      } else if ('binary' in data) {
        this.onmessage(data.binary);
      } else {
        this.close(data.close);
      }
    };
    this.worker.onerror = (event) => {
      console.error('Local game server failed', event.message);
      this.close(1011);
    };
    // The worker is ready as soon as it exists; open on the next task like a socket would.
    queueMicrotask(() => {
      this.open = true;
      this.onopen();
    });
  }

  send(text: string): void {
    if (this.open) {
      this.worker.postMessage(text);
    }
  }

  close(code = 1000): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.worker.terminate();
    this.onclose(code);
  }
}
