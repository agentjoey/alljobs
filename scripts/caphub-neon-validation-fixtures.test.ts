import { describe, expect, it } from "vitest";
import { createNeonValidationFixture, readNeonValidationFixture } from "../tests/e2e/caphub-neon-validation-fixtures";

function references(): Record<string, string> {
  return {
    CAPHUB_NEON_VALIDATION_BRANCH_ALIAS: "validation-a",
    CAPHUB_NEON_VALIDATION_DATABASE_URL: "postgresql://caphub_app:secret@validation-db.neon.tech/caphub?sslmode=require",
    CAPHUB_NEON_VALIDATION_DATABASE_HOST: "validation-db.neon.tech",
    CAPHUB_NEON_VALIDATION_S3_ACCESS_KEY_ID: "validation-access",
    CAPHUB_NEON_VALIDATION_S3_SECRET_ACCESS_KEY: "validation-secret",
    CAPHUB_NEON_VALIDATION_S3_ENDPOINT: "https://validation-storage.neon.tech",
    CAPHUB_NEON_VALIDATION_S3_HOST: "validation-storage.neon.tech",
    CAPHUB_NEON_VALIDATION_S3_REGION: "aws-ap-southeast-1",
    CAPHUB_NEON_RECOVERY_BRANCH_ALIAS: "recovery-a",
    CAPHUB_NEON_RECOVERY_DATABASE_URL: "postgresql://caphub_app:secret@recovery-db.neon.tech/caphub?sslmode=require",
    CAPHUB_NEON_RECOVERY_DATABASE_HOST: "recovery-db.neon.tech",
    CAPHUB_NEON_RECOVERY_S3_ACCESS_KEY_ID: "recovery-access",
    CAPHUB_NEON_RECOVERY_S3_SECRET_ACCESS_KEY: "recovery-secret",
    CAPHUB_NEON_RECOVERY_S3_ENDPOINT: "https://recovery-storage.neon.tech",
    CAPHUB_NEON_RECOVERY_S3_HOST: "recovery-storage.neon.tech",
    CAPHUB_NEON_RECOVERY_S3_REGION: "aws-ap-southeast-1"
  };
}

describe("non-Production Neon validation references", () => {
  it("skips when every explicit reference is absent", () => {
    expect(readNeonValidationFixture({})).toBeNull();
  });

  it("binds each validation URL and endpoint to its separately supplied exact resource host", async () => {
    const valid = readNeonValidationFixture(references());
    expect(valid).not.toBeNull();
    const fixture = createNeonValidationFixture(valid!);
    await Promise.all([fixture.source.pool.end(), fixture.recovery.pool.end()]);

    const wrongDatabase = references();
    wrongDatabase.CAPHUB_NEON_VALIDATION_DATABASE_URL = "postgresql://caphub_app:secret@production-db.neon.tech/caphub?sslmode=require";
    expect(() => createNeonValidationFixture(readNeonValidationFixture(wrongDatabase)!)).toThrow(/TLS contract/i);

    const wrongStorage = references();
    wrongStorage.CAPHUB_NEON_VALIDATION_S3_ENDPOINT = "https://production-storage.neon.tech";
    expect(() => createNeonValidationFixture(readNeonValidationFixture(wrongStorage)!)).toThrow(/approved/i);
  });
});
