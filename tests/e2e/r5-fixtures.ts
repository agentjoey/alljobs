import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { evaluateAttention } from "@/lib/monitoring/domain/attention";
import {
  buildCollectorSignal,
  buildDeploymentSignal,
  buildFreshnessSignal,
  buildMonitoringBinding,
  buildMonitoringSnapshot,
  buildNeonBinding,
  buildRuntimeSignal,
  buildSignalFreshness,
  buildUsageMeasure,
  FIXTURE_NOW
} from "@/lib/monitoring/domain/fixtures";
import type { MonitoringBinding, MonitoringSnapshot } from "@/lib/monitoring/domain/types";
import { appendTransitionEvents, type TransitionEvent } from "@/lib/monitoring/store/events";
import { publishCycle } from "@/lib/monitoring/store/store";

// R5 Application Monitoring e2e fixture (plan Task 9). Provisions an isolated
// tmpdir Control Host home with monitoring ENABLED against a fully local,
// schema-valid published cache. Safety design: every credential_ref names an
// environment variable that is deliberately never exported, so credential
// resolution fails closed BEFORE any adapter network call or probe; the one
// extension-provider binding (vercel, implemented: false) short-circuits with
// zero requests. All names are obviously fake; no token-shaped values exist.

const PREFIX = "alljobs-r5-e2e-";
const SENTINEL = ".alljobs-r5-e2e-fixture.json";
const ROOT_ENV = "ALLJOBS_R5_E2E_ROOT";
const TOKEN_ENV = "ALLJOBS_R5_E2E_FIXTURE_TOKEN";

/** Credential environment-variable NAMES only. These are never exported anywhere. */
export const R5_CREDENTIAL_ENV_NAMES = [
  "ALLJOBS_R5_E2E_RAILWAY_TOKEN",
  "ALLJOBS_R5_E2E_NEON_TOKEN",
  "ALLJOBS_R5_E2E_FLY_TOKEN",
  "ALLJOBS_R5_E2E_SUPABASE_TOKEN",
  "ALLJOBS_R5_E2E_VERCEL_TOKEN"
] as const;

export const R5_CYCLE_ID = "2026-09-11t06-00-00z";
const COLLECTED_AT = FIXTURE_NOW; // 2026-09-11T06:00:00Z

export interface R5Fixture {
  rootDir: string;
  homeDir: string;
  dataDir: string;
  monitoringDir: string;
  cleanup: () => void;
}

function assertOwnedFixture(rootDir: string) {
  const tempParent = realpathSync(tmpdir());
  const sentinelPath = join(rootDir, SENTINEL);
  if (
    dirname(rootDir) !== tempParent ||
    !basename(rootDir).startsWith(PREFIX) ||
    !lstatSync(rootDir).isDirectory() ||
    lstatSync(rootDir).isSymbolicLink() ||
    realpathSync(rootDir) !== rootDir ||
    !lstatSync(sentinelPath).isFile() ||
    lstatSync(sentinelPath).isSymbolicLink()
  ) {
    throw new Error(`Refusing to use an unsafe R5 fixture root: ${rootDir}`);
  }
  return sentinelPath;
}

function writeProject(
  dataDir: string,
  input: { slug: string; name: string; bindings?: MonitoringBinding[] }
) {
  writeFileSync(join(dataDir, "projects", `${input.slug}.json`), `${JSON.stringify({
    slug: input.slug,
    name: input.name,
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    git_branch: "main",
    ...(input.bindings ? { monitoring: { bindings: input.bindings } } : {}),
    archived: false
  }, null, 2)}\n`, "utf8");
}

// --- Bindings (registry configuration) ---

function talentvaultRailwayBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "railway-production-api",
    console_url: "https://railway.com/project/example.invalid-talentvault"
  });
}

function talentvaultNeonBinding(): MonitoringBinding {
  return buildNeonBinding({
    id: "neon-production-db",
    resource_id: "talentvault-db",
    console_url: "https://console.neon.tech/app/projects/talentvault-db"
  });
}

function grandegptRailwayBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "railway-production-web",
    required_signals: ["deployment"],
    console_url: "https://railway.com/project/example.invalid-grandegpt",
    probe: undefined
  });
}

function mathmagicsFlyBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "fly-production-worker",
    provider: "fly",
    resource_kind: "app",
    resource_id: "mathmagics-worker",
    required_signals: ["runtime"],
    credential_ref: "fly-primary",
    console_url: "https://fly.io/apps/mathmagics-worker",
    probe: undefined
  });
}

function pulseboardSupabaseBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "supabase-production-api",
    provider: "supabase",
    resource_kind: "project",
    resource_id: "pulseboardfixture001",
    expected_runtime: "always-on",
    required_signals: ["usage"],
    credential_ref: "supabase-primary",
    console_url: "https://supabase.com/dashboard/project/pulseboardfixture001",
    probe: undefined
  });
}

function orbitdeskVercelBinding(): MonitoringBinding {
  // Extension provider: implemented is false, so it must not declare required
  // signals and collection short-circuits without any request.
  return buildMonitoringBinding({
    id: "vercel-production-site",
    provider: "vercel",
    resource_kind: "project",
    resource_id: "orbitdesk-example-site",
    expected_runtime: "always-on",
    required_signals: [],
    credential_ref: "vercel-primary",
    console_url: "https://vercel.com/example.invalid/orbitdesk",
    probe: undefined
  });
}

function novawebRailwayBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "railway-production-app",
    console_url: "https://railway.com/project/example.invalid-novaweb"
  });
}

function doclockFlyBinding(): MonitoringBinding {
  return buildMonitoringBinding({
    id: "fly-production-app",
    provider: "fly",
    resource_kind: "app",
    resource_id: "doclock-production",
    required_signals: ["runtime"],
    credential_ref: "fly-primary",
    console_url: "https://fly.io/apps/doclock-production",
    probe: undefined
  });
}

// --- Snapshots (published cached projection; fully evaluated) ---

function snapshot(overrides: Record<string, unknown>): MonitoringSnapshot {
  return buildMonitoringSnapshot({ cycle_id: R5_CYCLE_ID, ...overrides });
}

/** talentvault railway: CRITICAL mixed evidence — deployment succeeded AND probe-confirmed unhealthy runtime. */
function talentvaultRailwaySnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    adapter: { version: "1.0.0", capabilities: ["deployment", "usage"] },
    deployment: buildDeploymentSignal({
      state: "succeeded",
      deployment_id: "dep-fixture-441",
      revision: "c41ea1",
      observed_at: "2026-09-11T05:55:00Z"
    }),
    runtime: buildRuntimeSignal({
      state: "unhealthy",
      observed_at: "2026-09-11T05:59:00Z",
      source: "probe",
      consecutive_failures: 2,
      detail: "probe status 503 is outside expected_status"
    }),
    usage: [
      buildUsageMeasure({
        metric: "cpu_seconds",
        value: 120,
        unit: "cpu_seconds",
        allowance: 1000,
        provider_reported_at: "2026-09-11T05:58:00Z",
        billing_alignment: "operational_only",
        availability: "available"
      })
    ],
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "deployment", observed_at: "2026-09-11T05:55:00Z", max_age_seconds: 3600, state: "current" }),
        buildSignalFreshness({ signal: "runtime", observed_at: "2026-09-11T05:59:00Z", max_age_seconds: 900, state: "current" })
      ]
    }),
    attention: "critical",
    reasons: [
      {
        code: "runtime_unhealthy_confirmed",
        dimension: "runtime",
        severity: "critical",
        summary: "Runtime is confirmed unhealthy after 2 consecutive failures of the independent probe.",
        observed_at: "2026-09-11T05:59:00Z"
      }
    ]
  });
}

/** talentvault neon: healthy, current. */
function talentvaultNeonSnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "talentvault",
    binding_id: "neon-production-db",
    provider: "neon",
    adapter: { version: "1.0.0", capabilities: ["runtime", "usage", "platform_incident"] },
    runtime: buildRuntimeSignal({ state: "healthy", observed_at: "2026-09-11T05:59:00Z", source: "provider" }),
    deployment: null,
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "runtime", observed_at: "2026-09-11T05:59:00Z", max_age_seconds: 3600, state: "current" })
      ]
    }),
    attention: "healthy",
    reasons: []
  });
}

/** grandegpt railway: WARNING — latest production deployment failed. */
function grandegptRailwaySnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "grandegpt",
    binding_id: "railway-production-web",
    provider: "railway",
    adapter: { version: "1.0.0", capabilities: ["deployment", "usage"] },
    deployment: buildDeploymentSignal({
      state: "failed",
      deployment_id: "dep-fixture-902",
      revision: "9b2d40",
      observed_at: "2026-09-11T05:41:00Z"
    }),
    runtime: null,
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "deployment", observed_at: "2026-09-11T05:41:00Z", max_age_seconds: 3600, state: "current" })
      ]
    }),
    attention: "warning",
    reasons: [
      {
        code: "deployment_failed",
        dimension: "deployment",
        severity: "warning",
        summary: "Latest production deployment 'dep-fixture-902' failed.",
        observed_at: "2026-09-11T05:41:00Z"
      }
    ]
  });
}

/** mathmagics fly: UNKNOWN — permission denied now; retained value past max age. */
function mathmagicsFlySnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "mathmagics",
    binding_id: "fly-production-worker",
    provider: "fly",
    adapter: { version: "1.0.0", capabilities: ["runtime", "usage"] },
    attempted_at: "2026-09-11T05:00:00Z",
    collector: { state: "permission_denied", attempted_at: "2026-09-11T05:00:00Z" },
    deployment: null,
    runtime: buildRuntimeSignal({ state: "healthy", observed_at: "2026-09-10T05:00:00Z", source: "provider" }),
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "runtime", observed_at: "2026-09-10T05:00:00Z", max_age_seconds: 3600, state: "expired" })
      ]
    }),
    attention: "unknown",
    reasons: [
      {
        code: "collector_permission_denied",
        dimension: "runtime",
        severity: "unknown",
        summary: "Required signal 'runtime' is untrustworthy: permission was denied for credential reference 'fly-primary'. Renew the credential or its scopes; retrying cannot restore trust.",
        observed_at: "2026-09-11T05:00:00Z"
      },
      {
        code: "stale_max_age_exceeded",
        dimension: "freshness",
        severity: "unknown",
        summary: "Required signal 'runtime' is older than its maximum trustworthy age of 3600s; the retained value no longer proves current health.",
        observed_at: "2026-09-10T05:00:00Z"
      }
    ]
  });
}

/** pulseboard supabase: WATCH — known allowance at 82%. */
function pulseboardSupabaseSnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "pulseboard",
    binding_id: "supabase-production-api",
    provider: "supabase",
    adapter: { version: "1.0.0", capabilities: ["runtime", "usage", "platform_incident"] },
    deployment: null,
    runtime: null,
    usage: [
      buildUsageMeasure({
        metric: "api_requests",
        value: 820,
        unit: "requests",
        allowance: 1000,
        provider_reported_at: "2026-09-11T05:58:00Z",
        billing_alignment: "provider_estimate",
        availability: "available"
      })
    ],
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "usage", observed_at: "2026-09-11T05:58:00Z", max_age_seconds: 86400, state: "current" })
      ]
    }),
    attention: "watch",
    reasons: [
      {
        code: "allowance_watch",
        dimension: "usage",
        severity: "watch",
        summary: "Usage measure 'api_requests' is at 82% of its known allowance (>= 75%).",
        observed_at: "2026-09-11T05:58:00Z"
      }
    ]
  });
}

/**
 * orbitdesk vercel: the extension provider is not implemented in Phase 1, so
 * the collector short-circuits as unsupported_capability with zero requests.
 * Attention and reasons are DERIVED through the real evaluator (never
 * hand-picked): the binding declares no required signals, and an optional
 * unsupported fact does not downgrade attention, so the genuine result is
 * healthy with no reasons — the unsupported state stays visible only in the
 * binding's Collector detail.
 */
function orbitdeskVercelSnapshot(): MonitoringSnapshot {
  const binding = orbitdeskVercelBinding();
  const collector = buildCollectorSignal({
    state: "unsupported_capability",
    attempted_at: FIXTURE_NOW,
    detail: "no adapter registered for vercel"
  });
  const freshness = buildFreshnessSignal({ signals: [] });
  const evaluation = evaluateAttention({
    binding,
    collector,
    deployment: null,
    runtime: null,
    usage: [],
    platform_incident: null,
    freshness,
    adapter_capabilities: [],
    now: FIXTURE_NOW
  });
  return snapshot({
    project: "orbitdesk",
    binding_id: binding.id,
    provider: "vercel",
    adapter: { version: "none", capabilities: [] },
    collector,
    deployment: null,
    runtime: null,
    usage: [],
    freshness,
    attention: evaluation.attention,
    reasons: evaluation.reasons
  });
}

/** doclock fly: HEALTHY — stays in the ledger, never in the attention queue. */
function doclockFlySnapshot(): MonitoringSnapshot {
  return snapshot({
    project: "doclock",
    binding_id: "fly-production-app",
    provider: "fly",
    adapter: { version: "1.0.0", capabilities: ["runtime", "usage"] },
    deployment: null,
    runtime: buildRuntimeSignal({ state: "healthy", observed_at: "2026-09-11T05:59:00Z", source: "provider" }),
    freshness: buildFreshnessSignal({
      signals: [
        buildSignalFreshness({ signal: "runtime", observed_at: "2026-09-11T05:59:00Z", max_age_seconds: 3600, state: "current" })
      ]
    }),
    attention: "healthy",
    reasons: []
  });
}

/** talentvault transition events: deployment succeeded, then the probe-confirmed runtime failure. */
function talentvaultEvents(): TransitionEvent[] {
  const provenance = { cycle_id: R5_CYCLE_ID, adapter_version: "1.0.0" };
  return [
    {
      schema_version: 1,
      type: "signal_state",
      project: "talentvault",
      binding_id: "railway-production-api",
      provider: "railway",
      dimension: "deployment",
      key: "deployment",
      previous: "building",
      new: "succeeded",
      observed_at: "2026-09-11T05:55:00Z",
      recorded_at: "2026-09-11T05:55:05Z",
      provenance
    },
    {
      schema_version: 1,
      type: "signal_state",
      project: "talentvault",
      binding_id: "railway-production-api",
      provider: "railway",
      dimension: "runtime",
      key: "runtime",
      previous: "healthy",
      new: "unhealthy",
      observed_at: "2026-09-11T05:59:00Z",
      recorded_at: "2026-09-11T05:59:05Z",
      provenance
    },
    {
      schema_version: 1,
      type: "attention",
      project: "talentvault",
      binding_id: "railway-production-api",
      provider: "railway",
      dimension: "runtime",
      key: "attention",
      previous: "healthy",
      new: "critical",
      reason_code: "runtime_unhealthy_confirmed",
      observed_at: "2026-09-11T05:59:00Z",
      recorded_at: "2026-09-11T05:59:05Z",
      provenance
    }
  ];
}

function createR5FixtureFresh(): R5Fixture {
  const rootDir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), PREFIX)));
  const token = randomUUID();
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const monitoringDir = join(homeDir, "state", "monitoring");
  const directories = [
    join(homeDir, "cache"), join(homeDir, "logs"), join(homeDir, "mirrors"), monitoringDir,
    join(dataDir, "projects"), join(dataDir, "roadmaps"), join(dataDir, "tasks"), join(dataDir, "log"),
    join(rootDir, "workspaces")
  ];
  for (const directory of directories) mkdirSync(directory, { recursive: true });
  writeFileSync(join(rootDir, SENTINEL), `${JSON.stringify({ token, ownerPid: process.pid })}\n`, "utf8");

  // Monitoring is enabled against credential env names that are never set, so
  // resolution fails closed before any adapter request or probe (collect.ts
  // resolves credentials first). The probe origin is a reserved example host.
  writeFileSync(join(homeDir, "config.json"), `${JSON.stringify({
    trustedCodeRoots: [join(rootDir, "workspaces")],
    refreshIntervalSeconds: 300,
    mirrorsDir: join(homeDir, "mirrors"),
    logsDir: join(homeDir, "logs"),
    cacheDir: join(homeDir, "cache"),
    monitoring: {
      enabled: true,
      refreshIntervalSeconds: 300,
      concurrency: 2,
      credentials: {
        "railway-primary": { provider: "railway", tokenEnv: "ALLJOBS_R5_E2E_RAILWAY_TOKEN" },
        "neon-primary": { provider: "neon", tokenEnv: "ALLJOBS_R5_E2E_NEON_TOKEN" },
        "fly-primary": { provider: "fly", tokenEnv: "ALLJOBS_R5_E2E_FLY_TOKEN" },
        "supabase-primary": { provider: "supabase", tokenEnv: "ALLJOBS_R5_E2E_SUPABASE_TOKEN" },
        "vercel-primary": { provider: "vercel", tokenEnv: "ALLJOBS_R5_E2E_VERCEL_TOKEN" }
      },
      probeAllowedHosts: { "talentvault-production": "https://talentvault.example.com" }
    }
  }, null, 2)}\n`, "utf8");

  writeProject(dataDir, { slug: "talentvault", name: "TalentVault", bindings: [talentvaultRailwayBinding(), talentvaultNeonBinding()] });
  writeProject(dataDir, { slug: "grandegpt", name: "GrandeGPT", bindings: [grandegptRailwayBinding()] });
  writeProject(dataDir, { slug: "mathmagics", name: "MathMagics", bindings: [mathmagicsFlyBinding()] });
  writeProject(dataDir, { slug: "pulseboard", name: "PulseBoard", bindings: [pulseboardSupabaseBinding()] });
  writeProject(dataDir, { slug: "orbitdesk", name: "OrbitDesk", bindings: [orbitdeskVercelBinding()] });
  // Registered for monitoring but never collected: appears as pending unknown.
  writeProject(dataDir, { slug: "novaweb", name: "NovaWeb", bindings: [novawebRailwayBinding()] });
  // Fully healthy: stays in the ledger, never enters the attention queue.
  writeProject(dataDir, { slug: "doclock", name: "DocLock", bindings: [doclockFlyBinding()] });
  // Registered WITHOUT monitoring bindings: must never appear in the ledger.
  writeProject(dataDir, { slug: "ledgerless", name: "Ledgerless" });

  publishCycle(monitoringDir, {
    cycle_id: R5_CYCLE_ID,
    collected_at: COLLECTED_AT,
    snapshots: [
      talentvaultRailwaySnapshot(),
      talentvaultNeonSnapshot(),
      grandegptRailwaySnapshot(),
      mathmagicsFlySnapshot(),
      pulseboardSupabaseSnapshot(),
      orbitdeskVercelSnapshot(),
      doclockFlySnapshot()
    ]
  });
  appendTransitionEvents(monitoringDir, talentvaultEvents());

  process.env[ROOT_ENV] = rootDir;
  process.env[TOKEN_ENV] = token;

  let cleaned = false;
  return {
    rootDir, homeDir, dataDir, monitoringDir,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      assertOwnedFixture(rootDir);
      rmSync(rootDir, { recursive: true, force: true });
    }
  };
}

export function createR5Fixture(): R5Fixture {
  if (process.env.TEST_WORKER_INDEX !== undefined) {
    const rootDir = resolve(process.env[ROOT_ENV] ?? "");
    if (!rootDir) throw new Error("ALLJOBS_R5_E2E_ROOT is required for R5 workers.");
    const sentinel = JSON.parse(readFileSync(assertOwnedFixture(rootDir), "utf8")) as { token?: string; ownerPid?: number };
    if (sentinel.token !== process.env[TOKEN_ENV] || sentinel.ownerPid !== process.ppid) throw new Error("Refusing an unowned R5 worker fixture.");
    return {
      rootDir,
      homeDir: join(rootDir, "home"),
      dataDir: join(rootDir, "data"),
      monitoringDir: join(rootDir, "home", "state", "monitoring"),
      cleanup: () => undefined
    };
  }
  return createR5FixtureFresh();
}
