import { decodeSnapshot, PROTOCOL_VERSION, type DecodedSnapshot, type ServerMessage } from '@conflict/shared';
import WebSocket from 'ws';

/** Minimal scripted client for integration tests: records every JSON message and decoded snapshot. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  readonly snapshots: DecodedSnapshot[] = [];
  readonly entities = new Map<number, DecodedSnapshot['upserts'][number]>();
  socket!: WebSocket;
  token = '';
  private seq = 0;

  static async connect(port: number, name: string, token?: string, protocol = PROTOCOL_VERSION): Promise<TestClient> {
    const client = new TestClient();
    await client.open(port, name, token, protocol);
    return client;
  }

  async open(port: number, name: string, token?: string, protocol = PROTOCOL_VERSION): Promise<void> {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.on('message', (data, isBinary) => {
      if (isBinary) {
        const snapshot = decodeSnapshot(new Uint8Array(data as Buffer));
        this.snapshots.push(snapshot);
        for (const id of snapshot.removes) {
          this.entities.delete(id);
        }
        for (const entity of snapshot.upserts) {
          this.entities.set(entity.id, entity);
        }
        return;
      }
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.t === 'welcome') {
        this.token = message.token;
      }
      this.messages.push(message);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
    this.send({ t: 'hello', protocol, name, ...(token ? { token } : {}) });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  command(command: unknown): void {
    this.send({ t: 'command', seq: ++this.seq, command });
  }

  async waitFor<T extends ServerMessage['t']>(type: T, predicate: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true, timeoutMs = 5000): Promise<Extract<ServerMessage, { t: T }>> {
    const started = Date.now();
    for (;;) {
      const found = this.messages.find((m): m is Extract<ServerMessage, { t: T }> => m.t === type && predicate(m as Extract<ServerMessage, { t: T }>));
      if (found) {
        return found;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for '${type}'. Got: ${this.messages.map((m) => m.t).join(', ')}`);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async waitUntil(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const started = Date.now();
    while (!check()) {
      if (Date.now() - started > timeoutMs) {
        throw new Error('Timed out waiting for condition.');
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  close(): void {
    this.socket.close();
  }
}
