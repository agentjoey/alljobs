import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createR1Fixture } from "./e2e/r1-fixtures";

const previousBacklog = process.env.ALLJOBS_R1_E2E_BACKLOG;
const previousToken = process.env.ALLJOBS_R1_E2E_TOKEN;
const temporaryRoots: string[] = [];

afterEach(async () => {
  if (previousBacklog === undefined) delete process.env.ALLJOBS_R1_E2E_BACKLOG;
  else process.env.ALLJOBS_R1_E2E_BACKLOG = previousBacklog;
  if (previousToken === undefined) delete process.env.ALLJOBS_R1_E2E_TOKEN;
  else process.env.ALLJOBS_R1_E2E_TOKEN = previousToken;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("R1 E2E fixture ownership", () => {
  it("never reuses an externally supplied Backlog path", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "alljobs-r1-e2e-")));
    temporaryRoots.push(root);
    const untrustedBacklog = join(root, "workspaces", "sample-code", "docs", "BACKLOG.md");
    await mkdir(join(root, "workspaces", "sample-code", "docs"), { recursive: true });
    await writeFile(untrustedBacklog, "untrusted fixture path\n", "utf8");
    process.env.ALLJOBS_R1_E2E_BACKLOG = untrustedBacklog;
    delete process.env.ALLJOBS_R1_E2E_TOKEN;

    const fixture = createR1Fixture();
    temporaryRoots.push(fixture.rootDir);
    expect(fixture.backlogPath).not.toBe(untrustedBacklog);
  });
});
