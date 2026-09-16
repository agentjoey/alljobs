import "server-only";

import { promises as dns } from "node:dns";
import net, { type Socket } from "node:net";
import type { Duplex } from "node:stream";

export const KIMI_PROXY_TARGETS = new Set([
  "api.kimi.com:443",
  "auth.kimi.com:443"
]);

export class KimiProxyError extends Error {
  constructor(readonly code: "PROXY_TARGET_DENIED" | "PROXY_ADDRESS_DENIED" | "PROXY_PEER_MISMATCH") {
    super(code);
    this.name = "KimiProxyError";
  }
}

export type KimiProxyResolver = (hostname: string) => Promise<readonly string[]>;
export type KimiProxySocket = Duplex & { remoteAddress?: string };
export type KimiProxyConnector = (options: {
  hostname: string;
  address: string;
  port: number;
}) => Promise<KimiProxySocket>;

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, octet) => (value * 256) + Number(octet), 0) >>> 0;
}

function ipv4In(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

export function isPublicProxyAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4]
    ].some(([base, bits]) => ipv4In(address, base as string, bits as number));
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::"
      && normalized !== "::1"
      && !normalized.startsWith("fe8")
      && !normalized.startsWith("fe9")
      && !normalized.startsWith("fea")
      && !normalized.startsWith("feb")
      && !normalized.startsWith("fc")
      && !normalized.startsWith("fd")
      && !normalized.startsWith("ff");
  }
  return false;
}

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((item) => item.address);
}

export async function authorizeKimiProxyTarget(
  authority: string,
  resolve: KimiProxyResolver = defaultResolve
): Promise<{ hostname: string; port: 443; addresses: readonly string[] }> {
  const separator = authority.lastIndexOf(":");
  const hostname = authority.slice(0, separator).toLowerCase();
  const port = Number(authority.slice(separator + 1));
  const normalized = `${hostname}:${port}`;
  if (!hostname || port !== 443 || !KIMI_PROXY_TARGETS.has(normalized)) {
    throw new KimiProxyError("PROXY_TARGET_DENIED");
  }
  const addresses = [...new Set(await resolve(hostname))];
  if (addresses.length === 0 || addresses.some((address) => !isPublicProxyAddress(address))) {
    throw new KimiProxyError("PROXY_ADDRESS_DENIED");
  }
  return { hostname, port: 443, addresses };
}

async function defaultConnect(options: {
  hostname: string;
  address: string;
  port: number;
}): Promise<KimiProxySocket> {
  return await new Promise<Socket>((resolve, reject) => {
    const socket = net.connect({ host: options.address, port: options.port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function endWith(socket: Socket, status: string): void {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

export async function startKimiEgressProxy(options: {
  resolve?: KimiProxyResolver;
  connect?: KimiProxyConnector;
  maxBytes?: number;
  timeoutMs?: number;
} = {}): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const resolve = options.resolve ?? defaultResolve;
  const connect = options.connect ?? defaultConnect;
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const server = net.createServer((client) => {
    let header = Buffer.alloc(0);
    const headerTimeout = setTimeout(() => client.destroy(), 5_000);
    const handleConnect = async (headerEnd: number) => {
      const firstLine = header.subarray(0, header.indexOf("\r\n")).toString("ascii");
      const match = /^CONNECT ([^ ]+) HTTP\/1\.[01]$/.exec(firstLine);
      if (!match) return endWith(client, "405 Method Not Allowed");

      try {
        const target = await authorizeKimiProxyTarget(match[1], resolve);
        const upstream = await connect({
          hostname: target.hostname,
          address: target.addresses[0],
          port: target.port
        });
        if (!upstream.remoteAddress || !target.addresses.includes(upstream.remoteAddress)) {
          upstream.destroy();
          throw new KimiProxyError("PROXY_PEER_MISMATCH");
        }

        let transferred = 0;
        const count = (bytes: Buffer) => {
          transferred += bytes.length;
          if (transferred > maxBytes) {
            client.destroy();
            upstream.destroy();
          }
        };
        client.on("data", count);
        upstream.on("data", count);
        const deadline = setTimeout(() => {
          client.destroy();
          upstream.destroy();
        }, timeoutMs);
        client.once("close", () => clearTimeout(deadline));
        upstream.once("close", () => clearTimeout(deadline));
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const remainder = header.subarray(headerEnd + 4);
        if (remainder.length > 0) upstream.write(remainder);
        client.pipe(upstream).pipe(client);
      } catch (error) {
        if (error instanceof KimiProxyError && error.code === "PROXY_TARGET_DENIED") {
          endWith(client, "403 Forbidden");
        } else {
          endWith(client, "502 Bad Gateway");
        }
      }
    };
    const onHeaderData = (chunk: Buffer) => {
      header = Buffer.concat([header, chunk]);
      if (header.length > 16 * 1024) {
        clearTimeout(headerTimeout);
        client.off("data", onHeaderData);
        return endWith(client, "431 Request Header Fields Too Large");
      }
      const headerEnd = header.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      clearTimeout(headerTimeout);
      client.off("data", onHeaderData);
      void handleConnect(headerEnd);
    };
    client.on("data", onHeaderData);
  });
  server.maxConnections = 1;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Kimi proxy failed to bind");
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}
