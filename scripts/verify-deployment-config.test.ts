import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyCaphubPostgresArtifacts } from "./verify-deployment-config.mjs";

describe("verify-deployment-config script", () => {
  it("executes cleanly and validates deployment invariants", () => {
    const scriptPath = resolve(process.cwd(), "scripts/verify-deployment-config.mjs");
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    expect(output).toContain("All deployment configs and invariants verified successfully.");
    expect(output).toContain("Checking deployment manifests and safety invariants");
  });

  it("rejects TCP listeners, broad socket modes, and non-fixed launch commands", () => {
    const valid = {
      packageScript: "tsx --conditions=react-server scripts/caphub-postgres.ts",
      plist: "<string>/opt/homebrew/opt/postgresql@17/bin/postgres</string><string>-D</string><string>&lt;ALLJOBS_HOME&gt;/postgres/caphub</string>",
      postgresqlConf: "listen_addresses = ''\nport = 54329\nunix_socket_permissions = 0700\n",
      pgHbaConf: "local caphub caphub_app peer map=caphub_map\nlocal caphub caphub_migrator peer map=caphub_map\nlocal all all reject\n"
    };
    expect(verifyCaphubPostgresArtifacts(valid)).toEqual([]);
    expect(verifyCaphubPostgresArtifacts({ ...valid, postgresqlConf: "listen_addresses = '*'\nport = 54329\nunix_socket_permissions = 0700" }))
      .toContain("PostgreSQL must not listen on TCP");
    expect(verifyCaphubPostgresArtifacts({ ...valid, postgresqlConf: "listen_addresses = ''\nport = 54329\nunix_socket_permissions = 0777" }))
      .toContain("PostgreSQL socket permissions must be 0700");
    expect(verifyCaphubPostgresArtifacts({ ...valid, plist: "<string>postgres</string>" }))
      .toContain("PostgreSQL LaunchAgent must use the fixed PostgreSQL 17 command and data directory");
  });
});
