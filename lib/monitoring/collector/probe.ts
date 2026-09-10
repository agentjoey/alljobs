import type { MonitoringProbe } from "../domain/types";
import type { DnsLookup, FetchLike } from "../adapters/contracts";

// Independent HTTPS probe with the SSRF boundary from design §12.2:
// - the target hostname comes only from a Control Host probeAllowedHosts
//   reference — never a raw binding URL;
// - HTTPS only, no embedded user info, relative paths only;
// - GET/HEAD only, no custom headers, no request body, redirect: "manual";
// - IP literals and DNS answers are screened against loopback, private,
//   link-local, multicast, CGNAT, benchmark, and reserved ranges;
// - response metadata is bounded and the body is never read or persisted.
// DNS and fetch are injected; nothing here touches the network directly.

/** Probe responses larger than this (declared content-length) are rejected. */
export const PROBE_MAX_BODY_BYTES = 1024 * 1024;

export const PROBE_REJECT_CODES = [
  "probe_not_https",
  "probe_userinfo",
  "probe_absolute_path",
  "probe_host_ref_unknown",
  "probe_ip_literal_blocked",
  "probe_dns_blocked",
  "probe_dns_failed",
  "probe_timeout",
  "probe_oversize_metadata",
  "probe_fetch_failed"
] as const;
export type ProbeRejectCode = (typeof PROBE_REJECT_CODES)[number];

/** Rejection messages are fixed per code and never echo internals. */
export class ProbeRejectedError extends Error {
  readonly code: ProbeRejectCode;
  constructor(code: ProbeRejectCode, message: string) {
    super(message);
    this.name = "ProbeRejectedError";
    this.code = code;
  }
}

export interface ProbeOutcome {
  /** The exact URL that was probed (allowlisted origin + relative path). */
  url: string;
  status: number;
  /** Whether the status is in the binding's expected_status list. */
  expected: boolean;
  observed_at: string;
}

export interface ProbeDeps {
  fetch: FetchLike;
  lookup: DnsLookup;
  /** Injected observation time (ISO timestamp). */
  now: string;
}

// --- Address screening ---

function parseIPv4(ip: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return null;
  const octets = match.slice(1).map(Number) as [number, number, number, number];
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isBlockedIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224 && a <= 239) return true; // multicast
  if (a >= 240) return true; // reserved
  return false;
}

/** Expands an IPv6 literal into eight 16-bit groups; null when invalid. */
function parseIPv6(ip: string): number[] | null {
  let input = ip.toLowerCase();
  // IPv4-mapped/compatible suffix: ::ffff:127.0.0.1
  const v4Match = /^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(input);
  let embeddedV4: [number, number, number, number] | null = null;
  if (v4Match) {
    embeddedV4 = parseIPv4(v4Match[2]);
    if (!embeddedV4) return null;
    input = v4Match[1];
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  for (const group of [...head, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  }
  const embeddedGroups = embeddedV4 ? 2 : 0;
  if (halves.length === 1 && head.length + embeddedGroups !== 8) return null;
  const missing = 8 - head.length - tail.length - embeddedGroups;
  if (missing < 0) return null;
  const groups = [
    ...head.map((group) => parseInt(group, 16)),
    ...Array<number>(missing).fill(0),
    ...tail.map((group) => parseInt(group, 16))
  ];
  if (embeddedV4) {
    const [a, b, c, d] = embeddedV4;
    groups.push((a << 8) | b, (c << 8) | d);
  }
  return groups.length === 8 ? groups : null;
}

function isBlockedIPv6(groups: number[]): boolean {
  const allZero = groups.every((group) => group === 0);
  if (allZero) return true; // :: unspecified
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1 loopback
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (groups[0] >> 8 === 0xff) return true; // ff00::/8 multicast
  // IPv4-mapped ::ffff:0.0.0.0/96 — screen the embedded IPv4 address.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isBlockedIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  return false;
}

/** True when the literal is an IP address in a non-routable/blocked range. */
export function isBlockedProbeAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedIPv6(v6);
  return false;
}

function isIPLiteral(hostname: string): boolean {
  return parseIPv4(hostname) !== null || parseIPv6(hostname) !== null;
}

// --- Probe execution ---

function assertRelativePath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("\\") ||
    /\s/.test(path)
  ) {
    throw new ProbeRejectedError("probe_absolute_path", "probe path must be a relative path on the allowlisted origin");
  }
  return path;
}

/**
 * Executes one bounded probe. Throws ProbeRejectedError for every boundary
 * violation; otherwise returns the observed status without reading the body.
 */
export async function executeProbe(
  probe: MonitoringProbe,
  probeAllowedHosts: Record<string, string>,
  deps: ProbeDeps
): Promise<ProbeOutcome> {
  const configured = probeAllowedHosts[probe.host_ref];
  if (!configured) {
    throw new ProbeRejectedError(
      "probe_host_ref_unknown",
      `probe host_ref '${probe.host_ref}' is not declared in Control Host probeAllowedHosts`
    );
  }

  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    throw new ProbeRejectedError("probe_not_https", "probeAllowedHosts value is not a valid URL");
  }
  if (origin.protocol !== "https:") {
    throw new ProbeRejectedError("probe_not_https", "probe origins must use HTTPS");
  }
  if (origin.username || origin.password) {
    throw new ProbeRejectedError("probe_userinfo", "probe origins must not embed user information");
  }

  const path = assertRelativePath(probe.path ?? "/");
  const target = new URL(path, origin.origin);
  if (target.origin !== origin.origin) {
    throw new ProbeRejectedError("probe_absolute_path", "probe path must not leave the allowlisted origin");
  }

  const hostname = origin.hostname.replace(/^\[|\]$/g, "");
  if (isIPLiteral(hostname)) {
    if (isBlockedProbeAddress(hostname)) {
      throw new ProbeRejectedError("probe_ip_literal_blocked", "probe origin IP literal is in a blocked range");
    }
    // A public IP literal needs no DNS screen; there is nothing to resolve.
  } else {
    let answers: string[];
    try {
      answers = await deps.lookup(hostname);
    } catch {
      throw new ProbeRejectedError("probe_dns_failed", "probe hostname could not be resolved");
    }
    if (!answers || answers.length === 0) {
      throw new ProbeRejectedError("probe_dns_failed", "probe hostname resolved to no addresses");
    }
    for (const answer of answers) {
      if (isBlockedProbeAddress(answer)) {
        throw new ProbeRejectedError("probe_dns_blocked", "probe hostname resolves into a blocked address range");
      }
    }
  }

  let response: Response;
  try {
    response = await deps.fetch(target.toString(), {
      method: probe.method,
      redirect: "manual",
      signal: AbortSignal.timeout(probe.timeout_ms)
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ProbeRejectedError("probe_timeout", "probe exceeded its configured timeout");
    }
    // Deliberately generic: transport errors may carry sensitive internals.
    throw new ProbeRejectedError("probe_fetch_failed", "probe request failed");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > PROBE_MAX_BODY_BYTES) {
    throw new ProbeRejectedError("probe_oversize_metadata", "probe response metadata exceeds the bounded limit");
  }

  // The body is never read, buffered, or persisted; the status line is the
  // entire evidence record.
  return {
    url: target.toString(),
    status: response.status,
    expected: probe.expected_status.includes(response.status),
    observed_at: deps.now
  };
}
