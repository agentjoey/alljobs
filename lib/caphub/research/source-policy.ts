import "server-only";

import { promises as dns } from "node:dns";
import net from "node:net";

export class ResearchSourcePolicyError extends Error {
  constructor(readonly code: "SOURCE_BLOCKED") {
    super(code);
    this.name = "ResearchSourcePolicyError";
  }
}

export interface AuthorizedHttpsTarget {
  readonly url: URL;
  readonly origin: string;
  readonly hostname: string;
  readonly addresses: readonly string[];
}

export type SourceDnsResolver = (hostname: string) => Promise<readonly string[]>;

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((answer) => answer.address);
}

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, octet) => (value * 256) + Number(octet), 0) >>> 0;
}

function inIpv4Range(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

export function normalizeIpAddress(address: string): string {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  return mapped?.[1] ?? lower;
}

export function isPublicSourceAddress(rawAddress: string): boolean {
  const address = normalizeIpAddress(rawAddress);
  const family = net.isIP(address);
  if (family === 4) {
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4]
    ].some(([base, bits]) => inIpv4Range(address, base as string, bits as number));
  }
  if (family === 6) {
    return address !== "::"
      && address !== "::1"
      && !/^fe[89ab]/.test(address)
      && !address.startsWith("fc")
      && !address.startsWith("fd")
      && !address.startsWith("ff");
  }
  return false;
}

export class ExactHttpsSourcePolicy {
  private readonly origins: ReadonlySet<string>;
  private readonly resolve: SourceDnsResolver;

  constructor(options: {
    allowedOrigins: readonly string[];
    resolve?: SourceDnsResolver;
  }) {
    const origins = options.allowedOrigins.map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
      }
      if (url.protocol !== "https:"
        || url.username
        || url.password
        || url.pathname !== "/"
        || url.search
        || url.hash) {
        throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
      }
      return url.origin;
    });
    this.origins = new Set(origins);
    this.resolve = options.resolve ?? defaultResolve;
  }

  get allowedOriginCount(): number {
    return this.origins.size;
  }

  async authorize(value: string | URL): Promise<AuthorizedHttpsTarget> {
    let url: URL;
    try {
      url = value instanceof URL ? new URL(value.href) : new URL(value);
    } catch {
      throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
    }
    if (url.protocol !== "https:"
      || url.username
      || url.password
      || url.hash
      || !this.origins.has(url.origin)) {
      throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (net.isIP(hostname) !== 0) throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
    let addresses: readonly string[];
    try {
      addresses = [...new Set((await this.resolve(hostname)).map(normalizeIpAddress))];
    } catch {
      throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicSourceAddress(address))) {
      throw new ResearchSourcePolicyError("SOURCE_BLOCKED");
    }
    return Object.freeze({ url, origin: url.origin, hostname, addresses: Object.freeze([...addresses]) });
  }
}
