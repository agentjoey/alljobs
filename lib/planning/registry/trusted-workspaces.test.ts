import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostConfig } from "../config";
import { listTrustedWorkspaces } from "./trusted-workspaces";

describe("listTrustedWorkspaces", () => {
  let trustedRoot: string;
  let outsideRoot: string;
  let config: ControlHostConfig;

  beforeEach(async () => {
    trustedRoot = await mkdtemp(join(tmpdir(), "alljobs-trusted-root-"));
    outsideRoot = await mkdtemp(join(tmpdir(), "alljobs-outside-root-"));
    await mkdir(join(trustedRoot, "direct-repository", "nested"), { recursive: true });
    await mkdir(join(outsideRoot, "escaped-repository"), { recursive: true });
    await symlink(join(outsideRoot, "escaped-repository"), join(trustedRoot, "escape"));
    config = { trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 };
  });

  afterEach(async () => {
    await rm(trustedRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });

  it("lists only direct-child directories and excludes nested, outside-root, and symlink-escape paths", async () => {
    expect(listTrustedWorkspaces(config)).toEqual([
      {
        name: "direct-repository",
        candidatePath: await realpath(join(trustedRoot, "direct-repository"))
      }
    ]);
  });
});
