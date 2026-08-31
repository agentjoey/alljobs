import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

const FIXTURE_PREFIX = "alljobs-document-adaptation-e2e-";
const FIXTURE_SENTINEL = ".alljobs-document-adaptation-e2e-fixture.json";

const CANONICAL_ROADMAP = `# Roadmap

## phase-1: Canonical phase

\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
focus: primary
\`\`\`

Prove the selected planning source without inference.
`;

const CANONICAL_BACKLOG = `# Backlog

## DA-B-001: Canonical backlog item

\`\`\`yaml alljobs
id: DA-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
rank: 100
dependencies: []
\`\`\`

Only strict parser output may become a Backlog card.
`;

const RECOVERABLE_BACKLOG = `# Backlog

## DA-B-002: Retained canonical sibling

\`\`\`yaml alljobs
id: DA-B-002
work_mode: implementation
phase: phase-1
status: ready
priority: P1
rank: 100
dependencies: []
\`\`\`

This valid sibling remains canonical.

## Task: Needs repair

\`\`\`yaml alljobs
work_mode: implementation
status: ready
dependencies: []
\`\`\`

This section is evidence only until a repository agent standardizes it.
`;

const UNSTRUCTURED_ROADMAP = `# Roadmap

### Notes for the next phase

This ordinary outline is readable but is not canonical planning data.
`;

const UNSTRUCTURED_BACKLOG = `# Backlog

- [ ] Prepare the next release
- [ ] Document operator notes
`;

export interface DocumentAdaptationFixture {
  rootDir: string;
  homeDir: string;
  dataDir: string;
  cleanup: () => void;
}

function runGit(cwd: string, args: string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function writeProject(dataDir: string, input: { slug: string; name: string; trustedPath: string }) {
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

function createRepository(path: string, roadmap: string, backlog?: string) {
  mkdirSync(join(path, "docs"), { recursive: true });
  writeFileSync(join(path, "docs", "ROADMAP.md"), roadmap, "utf8");
  if (backlog !== undefined) writeFileSync(join(path, "docs", "BACKLOG.md"), backlog, "utf8");
  runGit(path, ["init", "-b", "main"]);
  runGit(path, ["add", "--", "docs"]);
  runGit(path, [
    "-c",
    "user.name=AllJobs Document Adaptation Fixture",
    "-c",
    "user.email=document-adaptation-fixture@example.invalid",
    "commit",
    "-m",
    "fixture: commit planning documents"
  ]);
  return runGit(path, ["rev-parse", "HEAD"]);
}

function writeCachedProjection(homeDir: string, input: {
  slug: string;
  revision: string;
  backlogTitle: string;
}) {
  const fetchedAt = "2026-08-30T00:00:00.000Z";
  writeFileSync(join(homeDir, "cache", `${input.slug}.json`), `${JSON.stringify({
    project: input.slug,
    revision: input.revision,
    fetchedAt,
    freshness: "stale",
    roadmap: [{
      id: "phase-1",
      title: "Canonical phase",
      kind: "phase",
      status: "active",
      order: 10,
      focus: "primary"
    }],
    backlog: [{
      id: "DA-CACHED-001",
      title: input.backlogTitle,
      work_mode: "implementation",
      phase: "phase-1",
      status: "ready",
      priority: "P0",
      rank: 100,
      dependencies: []
    }],
    tasks: [],
    issues: [],
    provenance: [
      {
        provider: "git-markdown",
        location: "docs/ROADMAP.md",
        revision: input.revision,
        digest: "a".repeat(64),
        fetchedAt
      },
      {
        provider: "git-markdown",
        location: "docs/BACKLOG.md",
        revision: input.revision,
        digest: "b".repeat(64),
        fetchedAt
      }
    ],
    documents: [
      {
        document: "roadmap",
        state: "canonical",
        sourcePath: "docs/ROADMAP.md",
        digest: "a".repeat(64),
        revision: input.revision,
        diagnostics: [],
        candidates: []
      },
      {
        document: "backlog",
        state: "canonical",
        sourcePath: "docs/BACKLOG.md",
        digest: "b".repeat(64),
        revision: input.revision,
        diagnostics: [],
        candidates: []
      }
    ]
  }, null, 2)}\n`, "utf8");
}

function requireOwnedFixture(rootDir: string, token: string) {
  const temporaryParent = realpathSync(tmpdir());
  if (dirname(rootDir) !== temporaryParent || !basename(rootDir).startsWith(FIXTURE_PREFIX)) {
    throw new Error(`Refusing to use unexpected document-adaptation fixture root: ${rootDir}`);
  }
  const root = lstatSync(rootDir);
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(rootDir) !== rootDir) {
    throw new Error(`Refusing to use unsafe document-adaptation fixture root: ${rootDir}`);
  }
  const sentinelPath = join(rootDir, FIXTURE_SENTINEL);
  const sentinel = lstatSync(sentinelPath);
  if (!sentinel.isFile() || sentinel.isSymbolicLink() || realpathSync(sentinelPath) !== sentinelPath) {
    throw new Error(`Refusing to use unsafe document-adaptation fixture sentinel: ${sentinelPath}`);
  }
  const record = JSON.parse(readFileSync(sentinelPath, "utf8")) as { token?: string; ownerPid?: number };
  if (record.token !== token || record.ownerPid !== process.pid) {
    throw new Error("Refusing to clean an unowned document-adaptation fixture.");
  }
}

export function createDocumentAdaptationFixture(): DocumentAdaptationFixture {
  const temporaryParent = realpathSync(tmpdir());
  const rootDir = realpathSync(mkdtempSync(join(temporaryParent, FIXTURE_PREFIX)));
  const token = randomUUID();
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const workspacesDir = join(rootDir, "workspaces");

  for (const directory of [
    join(homeDir, "cache"),
    join(homeDir, "logs"),
    join(homeDir, "mirrors"),
    join(dataDir, "projects"),
    join(dataDir, "roadmaps"),
    join(dataDir, "tasks"),
    join(dataDir, "log"),
    workspacesDir
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

  const canonicalRepository = join(workspacesDir, "canonical-code");
  const canonicalRevision = createRepository(canonicalRepository, CANONICAL_ROADMAP, CANONICAL_BACKLOG);
  writeProject(dataDir, {
    slug: "canonical-code",
    name: "Canonical Code Fixture",
    trustedPath: canonicalRepository
  });

  const missingRepository = join(workspacesDir, "missing-backlog");
  createRepository(missingRepository, CANONICAL_ROADMAP);
  writeProject(dataDir, {
    slug: "missing-backlog",
    name: "Missing Backlog Fixture",
    trustedPath: missingRepository
  });
  writeCachedProjection(homeDir, {
    slug: "missing-backlog",
    revision: canonicalRevision,
    backlogTitle: "Cached fallback item"
  });

  const recoverableRepository = join(workspacesDir, "recoverable-code");
  createRepository(recoverableRepository, CANONICAL_ROADMAP, RECOVERABLE_BACKLOG);
  writeProject(dataDir, {
    slug: "recoverable-code",
    name: "Recoverable Code Fixture",
    trustedPath: recoverableRepository
  });

  const unstructuredRepository = join(workspacesDir, "unstructured-code");
  createRepository(unstructuredRepository, UNSTRUCTURED_ROADMAP, UNSTRUCTURED_BACKLOG);
  writeProject(dataDir, {
    slug: "unstructured-code",
    name: "Unstructured Code Fixture",
    trustedPath: unstructuredRepository
  });

  const remoteMirror = join(homeDir, "mirrors", "remote-readonly.git");
  runGit(rootDir, ["clone", "--bare", "--no-local", "--", canonicalRepository, remoteMirror]);
  writeProject(dataDir, {
    slug: "remote-readonly",
    name: "Remote Read-only Fixture",
    trustedPath: join(workspacesDir, "remote-readonly")
  });

  writeProject(dataDir, {
    slug: "cached-readonly",
    name: "Cached Read-only Fixture",
    trustedPath: join(workspacesDir, "cached-readonly")
  });
  writeCachedProjection(homeDir, {
    slug: "cached-readonly",
    revision: canonicalRevision,
    backlogTitle: "Cached read-only item"
  });

  let cleaned = false;
  return {
    rootDir,
    homeDir,
    dataDir,
    cleanup: () => {
      if (cleaned) return;
      requireOwnedFixture(rootDir, token);
      cleaned = true;
      rmSync(rootDir, { recursive: true, force: true });
    }
  };
}
