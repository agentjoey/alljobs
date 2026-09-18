import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RegistryMigration {
  id: string;
  filename: string;
  checksum: string;
  sql: string;
}

export function sha256MigrationSql(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function loadMigration(id: string, filename: string, checksum: string): RegistryMigration {
  const path = join(process.cwd(), "lib", "caphub", "registry", "migrations", filename);
  return Object.freeze({ id, filename, checksum, sql: readFileSync(path, "utf8") });
}

export const registryMigrationManifest: readonly RegistryMigration[] = Object.freeze([
  loadMigration(
    "001_registry",
    "001_registry.sql",
    "d48b33929743342b2fcfe11726a45653e06c0cc39a84949dcbf1ae9ec80e5fa8"
  ),
  loadMigration(
    "002_read_models",
    "002_read_models.sql",
    "fa8fefdef331966fdcb67db911ace73eca2d2f54702028acaa6735de1e8716c7"
  ),
  loadMigration(
    "003_exports",
    "003_exports.sql",
    "e9df0d799318069fa4d1e09438043a16666df695e6ccdf28ad0474a2121922e4"
  ),
  loadMigration(
    "004_capture_automation",
    "004_capture_automation.sql",
    "6055930cace6bb5679dfa839fa8525cf6bad6e1e058519995c8f8384cab7201b"
  )
]);
