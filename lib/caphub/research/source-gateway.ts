import "server-only";

import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import net from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import {
  normalizeIpAddress,
  type AuthorizedHttpsTarget,
  type ExactHttpsSourcePolicy
} from "./source-policy";

export type SourceKind = "official" | "repository" | "package" | "reputable" | "community" | "unknown";

export interface SourceCandidate {
  url: string;
  title: string;
  sourceKind: SourceKind;
  claims: string[];
}

export interface FetchedSource {
  url: string;
  status: number;
  contentType: string;
  text: string;
  compressedBytes: number;
  decompressedBytes: number;
  redirects: number;
}

export interface PinnedHttpsResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  remoteAddress: string;
  body: AsyncIterable<Uint8Array>;
  cancel?: () => void;
}

export interface PinnedHttpsTransport {
  request(target: AuthorizedHttpsTarget, signal: AbortSignal): Promise<PinnedHttpsResponse>;
}

export interface ResearchSourceGateway {
  search(query: string, signal: AbortSignal): Promise<readonly SourceCandidate[]>;
  fetch(url: string, signal: AbortSignal): Promise<FetchedSource>;
}

export type ResearchSearchPort = (
  query: string,
  signal: AbortSignal
) => Promise<readonly SourceCandidate[]>;

export type ResearchSourceErrorCode =
  | "SOURCE_ACCESS_DISABLED"
  | "SOURCE_BLOCKED"
  | "SOURCE_PEER_MISMATCH"
  | "SOURCE_REDIRECT_LIMIT"
  | "SOURCE_UNSUPPORTED_MEDIA"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_TIMEOUT"
  | "SOURCE_QUERY_LIMIT"
  | "SOURCE_FETCH_LIMIT"
  | "SOURCE_INVALID_RESPONSE";

export class ResearchSourceError extends Error {
  constructor(readonly code: ResearchSourceErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "ResearchSourceError";
  }
}

export class DisabledResearchSourceGateway implements ResearchSourceGateway {
  async search(_query: string, _signal: AbortSignal): Promise<readonly SourceCandidate[]> {
    throw new ResearchSourceError("SOURCE_ACCESS_DISABLED");
  }

  async fetch(_url: string, _signal: AbortSignal): Promise<FetchedSource> {
    throw new ResearchSourceError("SOURCE_ACCESS_DISABLED");
  }
}

function normalizedHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return normalized;
}

export class NodePinnedHttpsTransport implements PinnedHttpsTransport {
  async request(target: AuthorizedHttpsTarget, signal: AbortSignal): Promise<PinnedHttpsResponse> {
    return await new Promise((resolve, reject) => {
      const address = target.addresses[0];
      const family = net.isIP(address);
      if (!address || family === 0) return reject(new ResearchSourceError("SOURCE_BLOCKED"));
      const request = https.request(target.url, {
        method: "GET",
        servername: target.hostname,
        headers: {
          accept: "text/html, text/plain, application/json",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "AllJobs-Caphub/1"
        },
        lookup: (_hostname, _options, callback) => callback(null, address, family)
      }, (response) => {
        const remoteAddress = response.socket.remoteAddress;
        if (!remoteAddress) {
          response.destroy();
          return reject(new ResearchSourceError("SOURCE_PEER_MISMATCH"));
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: normalizedHeaders(response.headers),
          remoteAddress,
          body: response,
          cancel: () => response.destroy()
        });
      });
      const onAbort = () => request.destroy(new ResearchSourceError("SOURCE_TIMEOUT"));
      signal.addEventListener("abort", onAbort, { once: true });
      request.once("close", () => signal.removeEventListener("abort", onAbort));
      request.once("error", reject);
      if (signal.aborted) onAbort();
      else request.end();
    });
  }
}

function decodeBody(bytes: Buffer, encoding: string | undefined): Buffer {
  try {
    switch (encoding?.toLowerCase()) {
      case undefined:
      case "":
      case "identity":
        return bytes;
      case "gzip":
        return gunzipSync(bytes, { maxOutputLength: CAPHUB_ANALYSIS_LIMITS.maxDecompressedSourceBytes + 1 });
      case "deflate":
        return inflateSync(bytes, { maxOutputLength: CAPHUB_ANALYSIS_LIMITS.maxDecompressedSourceBytes + 1 });
      case "br":
        return brotliDecompressSync(bytes, { maxOutputLength: CAPHUB_ANALYSIS_LIMITS.maxDecompressedSourceBytes + 1 });
      default:
        throw new ResearchSourceError("SOURCE_UNSUPPORTED_MEDIA");
    }
  } catch (error) {
    if (error instanceof ResearchSourceError) throw error;
    if (error instanceof Error && /larger than|too large|maxOutputLength/i.test(error.message)) {
      throw new ResearchSourceError("SOURCE_TOO_LARGE");
    }
    throw new ResearchSourceError("SOURCE_INVALID_RESPONSE", { cause: error });
  }
}

async function collectBody(response: PinnedHttpsResponse): Promise<{
  text: string;
  compressedBytes: number;
  decompressedBytes: number;
  contentType: string;
}> {
  const contentType = (response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!["text/plain", "text/html", "application/json"].includes(contentType)) {
    response.cancel?.();
    throw new ResearchSourceError("SOURCE_UNSUPPORTED_MEDIA");
  }
  const chunks: Buffer[] = [];
  let compressedBytes = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    compressedBytes += bytes.length;
    if (compressedBytes > CAPHUB_ANALYSIS_LIMITS.maxCompressedSourceBytes) {
      response.cancel?.();
      throw new ResearchSourceError("SOURCE_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  const decoded = decodeBody(Buffer.concat(chunks), response.headers["content-encoding"]);
  if (decoded.length > CAPHUB_ANALYSIS_LIMITS.maxDecompressedSourceBytes) {
    throw new ResearchSourceError("SOURCE_TOO_LARGE");
  }
  return {
    text: decoded.toString("utf8"),
    compressedBytes,
    decompressedBytes: decoded.length,
    contentType
  };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export class LiveResearchSourceGateway implements ResearchSourceGateway {
  private readonly policy: ExactHttpsSourcePolicy;
  private readonly transport: PinnedHttpsTransport;
  private readonly searchPort?: ResearchSearchPort;
  private readonly timeoutMs: number;
  private searches = 0;
  private fetches = 0;

  constructor(options: {
    policy: ExactHttpsSourcePolicy;
    transport?: PinnedHttpsTransport;
    search?: ResearchSearchPort;
    timeoutMs?: number;
  }) {
    if (options.policy.allowedOriginCount === 0) {
      throw new ResearchSourceError("SOURCE_ACCESS_DISABLED");
    }
    this.policy = options.policy;
    this.transport = options.transport ?? new NodePinnedHttpsTransport();
    this.searchPort = options.search;
    this.timeoutMs = options.timeoutMs ?? CAPHUB_ANALYSIS_LIMITS.sourceFetchTimeoutMs;
  }

  async search(query: string, signal: AbortSignal): Promise<readonly SourceCandidate[]> {
    if (!this.searchPort) throw new ResearchSourceError("SOURCE_ACCESS_DISABLED");
    if (this.searches >= CAPHUB_ANALYSIS_LIMITS.maxSearchQueries) {
      throw new ResearchSourceError("SOURCE_QUERY_LIMIT");
    }
    this.searches += 1;
    return (await this.searchPort(query, signal)).slice(0, CAPHUB_ANALYSIS_LIMITS.maxFetchedSources);
  }

  async fetch(value: string, signal: AbortSignal): Promise<FetchedSource> {
    if (this.fetches >= CAPHUB_ANALYSIS_LIMITS.maxFetchedSources) {
      throw new ResearchSourceError("SOURCE_FETCH_LIMIT");
    }
    this.fetches += 1;
    return await this.fetchWithRedirects(value, signal);
  }

  private async fetchWithRedirects(value: string, externalSignal: AbortSignal): Promise<FetchedSource> {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(externalSignal.reason);
    externalSignal.addEventListener("abort", onAbort, { once: true });
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const deadline = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new ResearchSourceError(timedOut ? "SOURCE_TIMEOUT" : "SOURCE_BLOCKED"));
      }, { once: true });
    });
    try {
      let current = new URL(value);
      for (let redirects = 0; ; redirects += 1) {
        let target: AuthorizedHttpsTarget;
        try {
          target = await this.policy.authorize(current);
        } catch (error) {
          throw new ResearchSourceError("SOURCE_BLOCKED", { cause: error });
        }
        const response = await Promise.race([
          this.transport.request(target, controller.signal),
          deadline
        ]);
        const peer = normalizeIpAddress(response.remoteAddress);
        if (!target.addresses.includes(peer)) {
          response.cancel?.();
          throw new ResearchSourceError("SOURCE_PEER_MISMATCH");
        }
        if (isRedirect(response.status)) {
          response.cancel?.();
          if (redirects >= CAPHUB_ANALYSIS_LIMITS.maxRedirects) {
            throw new ResearchSourceError("SOURCE_REDIRECT_LIMIT");
          }
          const location = response.headers.location;
          if (!location) throw new ResearchSourceError("SOURCE_INVALID_RESPONSE");
          current = new URL(location, current);
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          response.cancel?.();
          throw new ResearchSourceError("SOURCE_INVALID_RESPONSE");
        }
        const body = await Promise.race([collectBody(response), deadline]);
        return {
          url: current.href,
          status: response.status,
          ...body,
          redirects
        };
      }
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener("abort", onAbort);
    }
  }
}
