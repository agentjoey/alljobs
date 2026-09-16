import { lstat, readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildKimiSeatbeltProfile,
  parseKimiStreamJson,
  runSandboxedKimiFixture
} from "./kimi-runner";

const fixturePath = join(process.cwd(), "lib/caphub/providers/fixtures/fake-kimi.mjs");
const agentProfilePath = join(process.cwd(), "lib/caphub/providers/profiles/kimi-research.md");

describe("Kimi stream-json runner", () => {
  it("returns exactly one terminal JSON string without raw protocol data", () => {
    const parsed = parseKimiStreamJson([
      JSON.stringify({ type: "system", message: "ready" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: '{"answer":"ok"}' }] } }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: '{"answer":"ok"}',
        usage: { input_tokens: 7, output_tokens: 3 }
      })
    ].join("\n"));
    expect(parsed).toEqual({
      terminalText: '{"answer":"ok"}',
      eventCount: 3,
      usage: { inputTokens: 7, outputTokens: 3 }
    });
    expect(parsed).not.toHaveProperty("events");
  });

  it("fails closed for malformed, multiple-terminal, and tool-call events", () => {
    expect(() => parseKimiStreamJson("not-json")).toThrowError(expect.objectContaining({ code: "INVALID_OUTPUT" }));
    expect(() => parseKimiStreamJson([
      JSON.stringify({ type: "result", subtype: "success", result: "{}", usage: { input_tokens: 1, output_tokens: 1 } }),
      JSON.stringify({ type: "result", subtype: "success", result: "{}", usage: { input_tokens: 1, output_tokens: 1 } })
    ].join("\n"))).toThrowError(expect.objectContaining({ code: "INVALID_OUTPUT" }));
    expect(() => parseKimiStreamJson(JSON.stringify({ type: "tool_call", name: "shell" })))
      .toThrowError(expect.objectContaining({ code: "PERMISSION" }));
    expect(() => parseKimiStreamJson(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "{}"
    }))).toThrowError(expect.objectContaining({ code: "INVALID_OUTPUT" }));
  });

  it("builds a deny-default profile with exact root/runtime and loopback only", () => {
    const profile = buildKimiSeatbeltProfile({
      temporaryRoot: "/private/tmp/caphub-safe",
      executablePath: "/usr/local/bin/kimi"
    });
    expect(profile).toContain("(deny default)");
    expect(profile).toContain('/private/tmp/caphub-safe');
    expect(profile).toContain('/usr/local/bin/kimi');
    expect(profile).toContain("localhost:*");
    expect(profile).not.toContain("/Users/xtation/AgentWorks");
  });

  it("ships a zero-tool agent profile with explicit capability denies", async () => {
    const profile = await readFile(agentProfilePath, "utf8");
    expect(profile).toContain("tools: []");
    for (const denied of ["Bash", "Shell", "Write", "Edit", "Git", "Agent", "AgentSwarm"]) {
      expect(profile).toContain(`- ${denied}`);
    }
    expect(profile).toContain("Return only the requested JSON object");
  });

  it.runIf(process.platform === "darwin")("uses real sandbox-exec and denies protected capabilities", async () => {
    expect(await readFile(fixturePath, "utf8")).toContain("FAKE_KIMI_SCENARIO");
    const result = await runSandboxedKimiFixture({ fixturePath, scenario: "probe" });

    expect(result.argv[0]).toBe("/usr/bin/sandbox-exec");
    expect(Object.keys(result.environment).sort()).toEqual([
      "CAPHUB_PROBE_FILE",
      "FAKE_KIMI_SCENARIO",
      "HOME",
      "KIMI_CODE_HOME",
      "LANG",
      "PATH",
      "TMPDIR"
    ]);
    expect(result.environment).not.toHaveProperty("SSH_AUTH_SOCK");
    expect(result.environment).not.toHaveProperty("GITHUB_TOKEN");
    const temporaryRoot = dirname(result.environment.KIMI_CODE_HOME);
    expect(result.cwd.startsWith(`${temporaryRoot}${sep}`)).toBe(true);
    expect(result.environment.HOME.startsWith(`${temporaryRoot}${sep}`)).toBe(true);
    expect(result.environment.TMPDIR.startsWith(`${temporaryRoot}${sep}`)).toBe(true);
    expect(result.probe.deniedReads).toEqual([
      "repository",
      "git",
      "default_kimi_home",
      "ssh",
      "keychain",
      "unrelated_user_file"
    ]);
    expect(result.probe.outsideWriteDenied).toBe(true);
    expect(result.probe.nestedProcessDenied).toBe(true);
    expect(result.probe.directNetworkDenied).toBe(true);
    expect(result.probe.loopbackReachable).toBe(true);
    expect(result.temporaryRootRemoved).toBe(true);
  });

  it.runIf(process.platform === "darwin")("kills capped and timed-out process groups and removes their roots", async () => {
    let floodRoot = "";
    await expect(runSandboxedKimiFixture({
      fixturePath,
      scenario: "flood",
      stdoutCap: 1024,
      observeTemporaryRoot: (root) => { floodRoot = root; }
    })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(await lstat(floodRoot).catch(() => undefined)).toBeUndefined();

    let hangRoot = "";
    await expect(runSandboxedKimiFixture({
      fixturePath,
      scenario: "hang",
      timeoutMs: 50,
      observeTemporaryRoot: (root) => { hangRoot = root; }
    })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(await lstat(hangRoot).catch(() => undefined)).toBeUndefined();
  });

  it.runIf(process.platform === "darwin")("fails closed on malformed and tool-call events from the real process boundary", async () => {
    await expect(runSandboxedKimiFixture({ fixturePath, scenario: "malformed" }))
      .rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    await expect(runSandboxedKimiFixture({ fixturePath, scenario: "tool" }))
      .rejects.toMatchObject({ code: "PERMISSION" });
  });
});
