import { chmod, lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { projectKimiLocalCredentials } from "./kimi-local-credentials";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "caphub-kimi-credentials-test-"));
  roots.push(root);
  const sourceHome = join(root, "source");
  const targetHome = join(root, "target");
  await mkdir(join(sourceHome, "credentials"), { recursive: true, mode: 0o700 });
  await mkdir(targetHome, { mode: 0o700 });
  const configPath = join(sourceHome, "config.toml");
  const credentialPath = join(sourceHome, "credentials", "kimi-code.json");
  await writeFile(configPath, [
    'default_model = "kimi-code/k3-256k"',
    '[models."kimi-code/k3-256k"]',
    'provider = "managed:kimi-code"',
    'model = "k3-256k"',
    '[providers."managed:kimi-code"]',
    'type = "managed"',
    'base_url = "https://api.kimi.com/coding/v1"',
    '[providers."managed:kimi-code".oauth]',
    'storage = "file"',
    'key = "kimi-code"',
    '[services.untrusted]',
    'base_url = "https://evil.example"'
  ].join("\n"), { mode: 0o600 });
  await writeFile(credentialPath, JSON.stringify({
    access_token: "secret-canary",
    refresh_token: "refresh-canary",
    expires_at: 9999999999,
    scope: "openid",
    token_type: "Bearer",
    expires_in: 3600
  }), { mode: 0o600 });
  return { root, sourceHome, targetHome, configPath, credentialPath };
}

describe("projectKimiLocalCredentials", () => {
  it("copies only strict OAuth material into fresh 0600 files", async () => {
    const f = await fixture();
    const result = await projectKimiLocalCredentials({ sourceHome: f.sourceHome, targetHome: f.targetHome });

    expect(await readFile(result.configPath, "utf8")).not.toMatch(/services|hooks|plugins|mcp|tools|evil/i);
    expect(JSON.parse(await readFile(result.credentialPath, "utf8"))).toMatchObject({ access_token: "secret-canary" });
    expect((await lstat(result.configPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(result.credentialPath)).mode & 0o777).toBe(0o600);
  });

  it("rejects symlinks, unsafe modes, oversized files, and unknown credential keys", async () => {
    const symlinkFixture = await fixture();
    const realConfig = join(symlinkFixture.sourceHome, "real.toml");
    await writeFile(realConfig, await readFile(symlinkFixture.configPath));
    await rm(symlinkFixture.configPath);
    await symlink(realConfig, symlinkFixture.configPath);
    await expect(projectKimiLocalCredentials(symlinkFixture)).rejects.toMatchObject({ code: "UNSAFE_CREDENTIAL_SOURCE" });

    const modeFixture = await fixture();
    await chmod(modeFixture.credentialPath, 0o666);
    await expect(projectKimiLocalCredentials(modeFixture)).rejects.toMatchObject({ code: "UNSAFE_CREDENTIAL_SOURCE" });

    const unknownFixture = await fixture();
    await writeFile(unknownFixture.credentialPath, JSON.stringify({ access_token: "x", arbitrary: "no" }), { mode: 0o600 });
    await expect(projectKimiLocalCredentials(unknownFixture)).rejects.toMatchObject({ code: "INVALID_CREDENTIAL_SOURCE" });

    const largeFixture = await fixture();
    await writeFile(largeFixture.credentialPath, "x".repeat(1_048_577), { mode: 0o600 });
    await expect(projectKimiLocalCredentials(largeFixture)).rejects.toMatchObject({ code: "UNSAFE_CREDENTIAL_SOURCE" });

    const extraFixture = await fixture();
    await writeFile(join(extraFixture.sourceHome, "credentials", "unknown.json"), "{}", { mode: 0o600 });
    await expect(projectKimiLocalCredentials(extraFixture)).rejects.toMatchObject({ code: "INVALID_CREDENTIAL_SOURCE" });
  });
});
