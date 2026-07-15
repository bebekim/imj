import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface MpvClient {
  send(command: (string | number)[]): Promise<any>;
  get(name: string): Promise<any>;
  set(name: string, value: any): Promise<void>;
  close(): void;
}

export function socketPath(): string {
  const dir = path.join(os.tmpdir(), 'imj-mpv');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `sock-${process.pid}.txt`);
}

export async function waitForSocket(p: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(p)) {
      await new Promise((r) => setTimeout(r, 100));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`mpv IPC socket not created at ${p}`);
}

export async function connectMpv(p: string, timeoutMs = 5000): Promise<MpvClient> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = '';
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    let id = 0;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`mpv IPC connect timeout`));
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve({
        send(command: (string | number)[]): Promise<any> {
          return new Promise((res, rej) => {
            const rid = ++id;
            pending.set(rid, { resolve: res, reject: rej });
            socket.write(JSON.stringify({ command, request_id: rid }) + '\n');
          });
        },
        get(name: string): Promise<any> {
          return new Promise((res, rej) => {
            const rid = ++id;
            pending.set(rid, { resolve: res, reject: rej });
            socket.write(JSON.stringify({ command: ['get_property', name], request_id: rid }) + '\n');
          });
        },
        set(name: string, value: any): Promise<void> {
          return new Promise((res, rej) => {
            const rid = ++id;
            pending.set(rid, { resolve: res, reject: rej });
            socket.write(JSON.stringify({ command: ['set_property', name, value], request_id: rid }) + '\n');
          }).then(() => undefined);
        },
        close(): void {
          socket.destroy();
        },
      });
    });

    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.substring(0, idx);
        buf = buf.substring(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.request_id !== undefined && pending.has(msg.request_id)) {
            const { resolve, reject } = pending.get(msg.request_id)!;
            pending.delete(msg.request_id);
            if (msg.error && msg.error !== 'success') {
              reject(new Error(msg.error));
            } else {
              resolve(msg.data);
            }
          }
        } catch {
          // ignore non-JSON (mpv events)
        }
      }
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`mpv IPC socket error: ${err.message}`));
    });

    socket.connect(p);
  });
}
