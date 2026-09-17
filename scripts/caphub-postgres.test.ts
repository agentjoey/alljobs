// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseCaphubPostgresArgs, runCaphubPostgres } from "./caphub-postgres";

describe("caphub-postgres command boundary", () => {
  it("accepts only check or confirmation-bound bootstrap/migrate actions", () => {
    expect(parseCaphubPostgresArgs(["--check"])).toEqual({ action: "check" });
    expect(parseCaphubPostgresArgs(["--bootstrap", "--confirm", "BOOTSTRAP-CAPHUB-POSTGRES"]))
      .toEqual({ action: "bootstrap" });
    expect(parseCaphubPostgresArgs(["--migrate", "--confirm", "APPLY-CAPHUB-MIGRATIONS"]))
      .toEqual({ action: "migrate" });

    for (const args of [
      [], ["--bootstrap"], ["--migrate"],
      ["--bootstrap", "--confirm", "wrong"],
      ["--migrate", "--confirm", "BOOTSTRAP-CAPHUB-POSTGRES"],
      ["--database-url", "postgresql://secret"], ["--data-dir", "/tmp/db"],
      ["--socket-dir", "/tmp/socket"], ["--sql", "DROP TABLE"], ["--root", "/tmp"]
    ]) expect(() => parseCaphubPostgresArgs(args)).toThrow();
  });

  it("keeps check read-only and dispatches mutations only after exact confirmation", async () => {
    const check = vi.fn(async () => ({ ready: false }));
    const bootstrap = vi.fn(async () => ({ initialized: true }));
    const migrate = vi.fn(async () => ({ applied: ["001_registry"] }));

    await expect(runCaphubPostgres(["--check"], { check, bootstrap, migrate }))
      .resolves.toEqual({ ready: false });
    expect(bootstrap).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();

    await expect(runCaphubPostgres(
      ["--bootstrap", "--confirm", "BOOTSTRAP-CAPHUB-POSTGRES"],
      { check, bootstrap, migrate }
    )).resolves.toEqual({ initialized: true });
    await expect(runCaphubPostgres(
      ["--migrate", "--confirm", "APPLY-CAPHUB-MIGRATIONS"],
      { check, bootstrap, migrate }
    )).resolves.toEqual({ applied: ["001_registry"] });
  });
});
