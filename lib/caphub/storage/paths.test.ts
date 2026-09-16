import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analysisArtifactRecordPath,
  analysisJobRecordPath,
  captureRecordPath,
  eventsPath,
  idempotencyLockPath,
  idempotencyRecordPath,
  modelCallEventsPath,
  objectPath,
  resolveCaphubRoot
} from "./paths";

const FIXTURE_PREFIX = "alljobs-caphub-paths-";
const SENTINEL_NAME = ".caphub-paths-test-owner.json";
const CAPTURE_ID = `cap_${"b".repeat(32)}`;
const DIGEST = "a".repeat(64);
const IDEMPOTENCY_KEY = "capture.request-20260915:abc";
const IDEMPOTENCY_HASH = "d1e7205c2bc82cc40961d3330d9d3689d0cc3280f31a83026d5e4fa8873d76da";
const JOB_ID = `job_${"c".repeat(32)}`;
const ARTIFACT_ID = `art_${"d".repeat(64)}`;

interface OwnedFixture {
  root: string;
  token: string;
}

const ownedFixtures: OwnedFixture[] = [];

function createOwnedFixture(): OwnedFixture {
  const temporaryParent = realpathSync(tmpdir());
  const root = realpathSync(mkdtempSync(join(temporaryParent, FIXTURE_PREFIX)));
  const fixture = { root, token: randomUUID() };

  writeFileSync(
    join(root, SENTINEL_NAME),
    JSON.stringify({ token: fixture.token, ownerPid: process.pid }),
    { flag: "wx" }
  );
  ownedFixtures.push(fixture);
  return fixture;
}

function createCaphubRoot(fixtureRoot: string, homeName = "home"): string {
  const root = join(fixtureRoot, homeName, "state", "caphub");
  mkdirSync(root, { recursive: true });
  return realpathSync(root);
}

function removeOwnedFixture(fixture: OwnedFixture): void {
  const temporaryParent = realpathSync(tmpdir());
  const sentinelPath = join(fixture.root, SENTINEL_NAME);
  const rootStat = lstatSync(fixture.root);
  const sentinelStat = lstatSync(sentinelPath);

  if (
    dirname(fixture.root) !== temporaryParent ||
    !basename(fixture.root).startsWith(FIXTURE_PREFIX) ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    realpathSync(fixture.root) !== fixture.root ||
    !sentinelStat.isFile() ||
    sentinelStat.isSymbolicLink() ||
    realpathSync(sentinelPath) !== sentinelPath
  ) {
    throw new Error(`Refusing to remove unsafe Caphub path fixture: ${fixture.root}`);
  }

  const owner = JSON.parse(readFileSync(sentinelPath, "utf8")) as {
    token?: string;
    ownerPid?: number;
  };
  if (owner.token !== fixture.token || owner.ownerPid !== process.pid) {
    throw new Error(`Refusing to remove unowned Caphub path fixture: ${fixture.root}`);
  }

  rmSync(fixture.root, { recursive: true, force: true });
}

afterEach(() => {
  while (ownedFixtures.length > 0) {
    removeOwnedFixture(ownedFixtures.pop() as OwnedFixture);
  }
});

describe("resolveCaphubRoot", () => {
  it("accepts an existing absolute resolved state/caphub root", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    expect(resolveCaphubRoot(root)).toBe(root);
  });

  it("rejects broad, relative, unresolved, expanded-home, variable, and glob roots", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);
    const home = dirname(dirname(root));
    const unsafeRoots = [
      "/",
      homedir(),
      "state/caphub",
      "~/state/caphub",
      "$ALLJOBS_HOME/state/caphub",
      `${fixture.root}/$ALLJOBS_HOME/state/caphub`,
      `${fixture.root}/\`ALLJOBS_HOME\`/state/caphub`,
      `${fixture.root}/*/state/caphub`,
      `${fixture.root}/?/state/caphub`,
      `${fixture.root}/[home]/state/caphub`,
      `${fixture.root}/{home,other}/state/caphub`,
      `${fixture.root}/!home/state/caphub`,
      `${home}/state/../state/caphub`
    ];

    for (const unsafeRoot of unsafeRoots) {
      expect(() => resolveCaphubRoot(unsafeRoot), unsafeRoot).toThrow();
    }
  });

  it("rejects a root whose state component is a symlink escaping its lexical home", () => {
    const fixture = createOwnedFixture();
    const home = join(fixture.root, "home");
    const escapedState = join(fixture.root, "outside", "state");
    mkdirSync(home, { recursive: true });
    mkdirSync(join(escapedState, "caphub"), { recursive: true });
    symlinkSync(escapedState, join(home, "state"), "dir");

    expect(() => resolveCaphubRoot(join(home, "state", "caphub"))).toThrow();
  });
});

describe("Caphub descendant paths", () => {
  it("constructs only the fixed capture, idempotency, object, event, and lock descendants", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    expect(captureRecordPath(root, CAPTURE_ID)).toBe(
      join(root, "records", "captures", `${CAPTURE_ID}.json`)
    );
    expect(idempotencyRecordPath(root, IDEMPOTENCY_KEY)).toBe(
      join(root, "records", "idempotency", `${IDEMPOTENCY_HASH}.json`)
    );
    expect(objectPath(root, DIGEST)).toBe(
      join(root, "objects", "sha256", "aa", DIGEST)
    );
    expect(eventsPath(root, "2026-09")).toBe(join(root, "events", "2026-09.jsonl"));
    expect(idempotencyLockPath(root, IDEMPOTENCY_KEY)).toBe(
      join(root, "locks", `${IDEMPOTENCY_HASH}.lock`)
    );
    expect(analysisJobRecordPath(root, JOB_ID)).toBe(
      join(root, "records", "analysis-jobs", `${JOB_ID}.json`)
    );
    expect(analysisArtifactRecordPath(root, ARTIFACT_ID)).toBe(
      join(root, "records", "analysis-artifacts", `${ARTIFACT_ID}.json`)
    );
    expect(modelCallEventsPath(root, JOB_ID)).toBe(
      join(root, "events", "model-calls", `${JOB_ID}.jsonl`)
    );
  });

  it("rejects malformed Capture IDs and digests", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    for (const captureId of [
      `cap_${"a".repeat(31)}`,
      `cap_${"A".repeat(32)}`,
      `../cap_${"a".repeat(32)}`,
      `cap_${"a".repeat(32)}/child`
    ]) {
      expect(() => captureRecordPath(root, captureId), captureId).toThrow();
    }

    for (const digest of [
      "a".repeat(63),
      "A".repeat(64),
      `${"a".repeat(62)}/a`,
      `../${"a".repeat(64)}`
    ]) {
      expect(() => objectPath(root, digest), digest).toThrow();
    }
  });

  it("rejects traversal and malformed analysis job/artifact identifiers", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    for (const jobId of ["job_short", `job_${"C".repeat(32)}`, `../${JOB_ID}`, `${JOB_ID}/child`]) {
      expect(() => analysisJobRecordPath(root, jobId), jobId).toThrow();
      expect(() => modelCallEventsPath(root, jobId), jobId).toThrow();
    }
    for (const artifactId of ["art_short", `art_${"D".repeat(64)}`, `../${ARTIFACT_ID}`, `${ARTIFACT_ID}/child`]) {
      expect(() => analysisArtifactRecordPath(root, artifactId), artifactId).toThrow();
    }
  });

  it("rejects forward and backward path separators in idempotency keys", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    for (const key of ["capture/request-20260915:abc", "capture\\request-20260915:abc"]) {
      expect(() => idempotencyRecordPath(root, key), key).toThrow();
      expect(() => idempotencyLockPath(root, key), key).toThrow();
    }
  });

  it("rejects malformed event months", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);

    for (const month of ["2026-00", "2026-13", "2026-9", "2026-09/escape"]) {
      expect(() => eventsPath(root, month), month).toThrow();
    }
  });

  it("rejects an existing descendant symlink that escapes the Caphub root", () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture.root);
    const outside = join(fixture.root, "outside-records");
    mkdirSync(outside);
    symlinkSync(outside, join(root, "records"), "dir");

    expect(() => captureRecordPath(root, CAPTURE_ID)).toThrow();
  });
});
