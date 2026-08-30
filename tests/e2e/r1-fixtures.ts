import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const FIXTURE_PREFIX = "alljobs-r1-e2e-";
const FIXTURE_SENTINEL = ".alljobs-r1-e2e-fixture.json";
const FIXTURE_TOKEN_ENV = "ALLJOBS_R1_E2E_TOKEN";

const ROADMAP = `# Sample Code Roadmap

## phase-1: Boundary proof

\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
focus: primary
\`\`\`

Exercise the R1 browser-to-filesystem boundary.

## phase-2: Later lane

\`\`\`yaml alljobs
id: phase-2
kind: phase
status: active
order: 20
focus: normal
\`\`\`

Keep a second lane available for conflict repair coverage.
`;

const COMMITTED_BACKLOG = `# Sample Code Backlog

This document is committed before the fixture creates a known local edit.

## AJ-B-001: Committed backlog title

\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
dependencies: []
\`\`\`

Manual note: uncommitted owner guidance.

## AJ-B-002: Preserve human formatting

\`\`\`yaml alljobs
id: AJ-B-002
work_mode: implementation
phase: phase-1
status: doing
priority: P0
dependencies: []
\`\`\`

Keep this body byte-for-byte outside declared scalar writes.

## AJ-B-003: Read-only projection proof

\`\`\`yaml alljobs
id: AJ-B-003
work_mode: implementation
phase: phase-1
status: blocked
priority: P1
dependencies: []
\`\`\`

Blocked for an external review.

## AJ-B-004: Historical item

\`\`\`yaml alljobs
id: AJ-B-004
work_mode: implementation
phase: phase-1
status: done
priority: P2
dependencies: []
\`\`\`

History stays outside active ordering.
`;

export const UNRANKED_DIRTY_BACKLOG = COMMITTED_BACKLOG.replace(
  "## AJ-B-001: Committed backlog title",
  "## AJ-B-001: Visible uncommitted local value"
);

export const RANKED_DIRTY_BACKLOG = UNRANKED_DIRTY_BACKLOG
  .replace("priority: P0\ndependencies: []", "priority: P0\nrank: 100\ndependencies: []")
  .replace("priority: P0\ndependencies: []", "priority: P0\nrank: 200\ndependencies: []")
  .replace("priority: P1\ndependencies: []", "priority: P1\nrank: 100\ndependencies: []");

export const INVALID_DIRTY_BACKLOG = `# Sample Code Backlog

## AJ-B-001: Valid sibling remains visible

\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
rank: 100
dependencies: []
\`\`\`

The valid sibling must not hide an invalid local section.

## AJ-B-INVALID: Invalid local priority

\`\`\`yaml alljobs
id: AJ-B-INVALID
work_mode: implementation
phase: phase-1
status: ready
priority: P9
rank: 200
dependencies: []
\`\`\`

This invalid local section must remain authoritative and non-writable.
`;

export const CONFLICTING_DIRTY_BACKLOG = RANKED_DIRTY_BACKLOG
  .replace(
    "phase: phase-1\nstatus: doing\npriority: P0\nrank: 200",
    "phase: phase-2\nstatus: doing\npriority: P1\nrank: 100"
  )
  .replace("phase: phase-1\nstatus: blocked", "phase: phase-2\nstatus: blocked");

interface R1Fixture {
  rootDir: string;
  homeDir: string;
  dataDir: string;
  repositoryDir: string;
  backlogPath: string;
  cleanup: () => void;
}

function requireOwnedDirectory(path: string, label: string) {
  const entry = lstatSync(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error(`Refusing to use unsafe R1 fixture ${label}: ${path}`);
  }
}

function requireOwnedFile(path: string, label: string) {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error(`Refusing to use unsafe R1 fixture ${label}: ${path}`);
  }
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function writeProject(dataDir: string, input: {
  slug: string;
  name: string;
  trustedPath: string;
}) {
  writeFileSync(join(dataDir, "projects", `${input.slug}.json`), `${JSON.stringify({
    slug: input.slug,
    name: input.name,
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    git_branch: "main",
    trusted_path: input.trustedPath,
    archived: false
  }, null, 2)}\n`, "utf8");
}

export function createR1Fixture(): R1Fixture {
  if (process.env.TEST_WORKER_INDEX !== undefined) {
    const { rootDir, repositoryDir, backlogPath } = getR1FixturePaths();
    return {
      rootDir,
      homeDir: join(rootDir, "home"),
      dataDir: join(rootDir, "data"),
      repositoryDir,
      backlogPath,
      cleanup: () => undefined
    };
  }
  const temporaryParent = realpathSync(tmpdir());
  const rootDir = realpathSync(mkdtempSync(join(temporaryParent, FIXTURE_PREFIX)));
  const token = randomUUID();
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const workspacesDir = join(rootDir, "workspaces");
  const repositoryDir = join(workspacesDir, "sample-code");
  const backlogPath = join(repositoryDir, "docs", "BACKLOG.md");

  for (const directory of [
    homeDir,
    join(homeDir, "cache"),
    join(homeDir, "logs"),
    join(homeDir, "mirrors"),
    join(dataDir, "projects"),
    join(dataDir, "roadmaps"),
    join(dataDir, "tasks"),
    join(dataDir, "log"),
    workspacesDir,
    join(repositoryDir, "docs")
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(rootDir, FIXTURE_SENTINEL), `${JSON.stringify({ token, ownerPid: process.pid })}\n`, "utf8");

  writeFileSync(join(homeDir, "config.json"), `${JSON.stringify({
    trustedCodeRoots: [workspacesDir],
    refreshIntervalSeconds: 300,
    mirrorsDir: join(homeDir, "mirrors"),
    logsDir: join(homeDir, "logs"),
    cacheDir: join(homeDir, "cache")
  }, null, 2)}\n`, "utf8");

  writeFileSync(join(repositoryDir, "docs", "ROADMAP.md"), ROADMAP, "utf8");
  writeFileSync(backlogPath, COMMITTED_BACKLOG, "utf8");
  runGit(repositoryDir, ["init", "-b", "main"]);
  runGit(repositoryDir, ["add", "--", "docs/ROADMAP.md", "docs/BACKLOG.md"]);
  runGit(repositoryDir, [
    "-c",
    "user.name=AllJobs R1 Fixture",
    "-c",
    "user.email=r1-fixture@example.invalid",
    "commit",
    "-m",
    "fixture: commit planning documents"
  ]);
  const headRevision = runGit(repositoryDir, ["rev-parse", "HEAD"]);

  writeFileSync(backlogPath, UNRANKED_DIRTY_BACKLOG, "utf8");
  writeProject(dataDir, {
    slug: "sample-code",
    name: "Sample Code Local",
    trustedPath: repositoryDir
  });

  const remoteMirror = join(homeDir, "mirrors", "sample-remote.git");
  runGit(rootDir, ["clone", "--bare", "--no-local", "--", repositoryDir, remoteMirror]);
  writeProject(dataDir, {
    slug: "sample-remote",
    name: "Sample Code Remote",
    trustedPath: join(workspacesDir, "missing-remote")
  });

  writeProject(dataDir, {
    slug: "sample-cache",
    name: "Sample Code Cache",
    trustedPath: join(workspacesDir, "missing-cache")
  });
  writeFileSync(join(homeDir, "cache", "sample-cache.json"), `${JSON.stringify({
    project: "sample-cache",
    revision: headRevision,
    fetchedAt: "2026-08-29T00:00:00.000Z",
    freshness: "fresh",
    roadmap: [{
      id: "phase-1",
      title: "Boundary proof",
      kind: "phase",
      status: "active",
      order: 10,
      focus: "primary"
    }],
    backlog: [{
      id: "AJ-B-001",
      title: "Cached backlog value",
      work_mode: "implementation",
      phase: "phase-1",
      status: "ready",
      priority: "P0",
      rank: 100,
      dependencies: [],
      body: "Cache evidence remains read-only."
    }],
    tasks: [],
    issues: [],
    provenance: [
      {
        provider: "git-markdown",
        location: "docs/ROADMAP.md",
        revision: headRevision,
        digest: "a".repeat(64),
        fetchedAt: "2026-08-29T00:00:00.000Z"
      },
      {
        provider: "git-markdown",
        location: "docs/BACKLOG.md",
        revision: headRevision,
        digest: "b".repeat(64),
        fetchedAt: "2026-08-29T00:00:00.000Z"
      }
    ]
  }, null, 2)}\n`, "utf8");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const owned = getR1FixturePaths();
    if (owned.rootDir !== rootDir) throw new Error(`Refusing to clean another R1 fixture root: ${owned.rootDir}`);
    rmSync(owned.rootDir, { recursive: true, force: true });
  };

  // The config runner owns fixture creation. Workers inherit both the exact
  // path and an unguessable sentinel token, then re-validate every path.
  process.env.ALLJOBS_R1_E2E_BACKLOG = backlogPath;
  process.env[FIXTURE_TOKEN_ENV] = token;
  return { rootDir, homeDir, dataDir, repositoryDir, backlogPath, cleanup };
}

export function getR1FixturePaths() {
  const configuredBacklog = process.env.ALLJOBS_R1_E2E_BACKLOG;
  if (!configuredBacklog) throw new Error("ALLJOBS_R1_E2E_BACKLOG is required for isolated R1 tests.");
  const token = process.env[FIXTURE_TOKEN_ENV];
  if (!token) throw new Error("ALLJOBS_R1_E2E_TOKEN is required for isolated R1 tests.");

  const backlogPath = resolve(configuredBacklog);
  const repositoryDir = dirname(dirname(backlogPath));
  const workspacesDir = dirname(repositoryDir);
  const rootDir = dirname(workspacesDir);
  const temporaryParent = realpathSync(tmpdir());
  if (
    backlogPath !== join(repositoryDir, "docs", "BACKLOG.md") ||
    dirname(rootDir) !== temporaryParent ||
    !basename(rootDir).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to use unexpected R1 fixture path: ${backlogPath}`);
  }

  requireOwnedDirectory(rootDir, "root");
  requireOwnedDirectory(workspacesDir, "workspace root");
  requireOwnedDirectory(repositoryDir, "repository");
  requireOwnedDirectory(join(repositoryDir, "docs"), "docs directory");
  requireOwnedFile(backlogPath, "Backlog");
  requireOwnedFile(join(rootDir, FIXTURE_SENTINEL), "sentinel");
  const sentinel = JSON.parse(readFileSync(join(rootDir, FIXTURE_SENTINEL), "utf8")) as { token?: string; ownerPid?: number };
  const isOwner = sentinel.ownerPid === process.pid;
  const isWorker = process.env.TEST_WORKER_INDEX !== undefined && sentinel.ownerPid === process.ppid;
  if (sentinel.token !== token || (!isOwner && !isWorker)) {
    throw new Error("Refusing to use an R1 fixture with an unowned sentinel.");
  }

  return { rootDir, repositoryDir, backlogPath };
}

export function resetR1Backlog(mode: "unranked" | "ranked" | "invalid" | "conflict" = "unranked") {
  const { backlogPath } = getR1FixturePaths();
  const content = mode === "ranked"
    ? RANKED_DIRTY_BACKLOG
    : mode === "conflict"
      ? CONFLICTING_DIRTY_BACKLOG
    : mode === "invalid"
      ? INVALID_DIRTY_BACKLOG
      : UNRANKED_DIRTY_BACKLOG;
  writeFileSync(backlogPath, content, "utf8");
  return content;
}

export function readR1Backlog() {
  return readFileSync(getR1FixturePaths().backlogPath, "utf8");
}

export function readR1Activity() {
  const activityPath = join(getR1FixturePaths().rootDir, "data", "log", "activity.jsonl");
  return existsSync(activityPath) ? readFileSync(activityPath, "utf8") : "";
}

export function makeUnrelatedR1Edit() {
  const { backlogPath } = getR1FixturePaths();
  const before = readFileSync(backlogPath, "utf8");
  const after = before.replace(
    "Manual note: uncommitted owner guidance.",
    "Manual note: externally edited while review was open."
  );
  if (after === before) throw new Error("R1 stale fixture body marker was not found.");
  writeFileSync(backlogPath, after, "utf8");
  return after;
}

export function readR1GitHead() {
  return runGit(getR1FixturePaths().repositoryDir, ["rev-parse", "HEAD"]);
}

export function readR1GitStatus() {
  return runGit(getR1FixturePaths().repositoryDir, [
    "status",
    "--porcelain=v1",
    "--",
    "docs/ROADMAP.md",
    "docs/BACKLOG.md"
  ]);
}
