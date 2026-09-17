import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEPLOYMENT_LOCK_DIRECTORY = ".caphub-deployment.lock";

export interface OperationRecord {
  schema_version: 1;
  deployment_id: string;
  plan_digest: string;
  action: "publish" | "rollback";
  stage: "versioned" | "realized" | "completed";
  release: {
    record_id: string;
    version: number;
    digest: string;
  };
  manifest_digest: string;
  created_at: string;
}

export async function readOperation(root: string, deploymentId: string): Promise<OperationRecord | null> {
  try {
    return JSON.parse(await readFile(join(root, "operations", `${deploymentId}.json`), "utf8")) as OperationRecord;
  } catch {
    return null;
  }
}

export async function writeOperation(root: string, record: OperationRecord): Promise<void> {
  const { mkdir, open, rename } = await import("node:fs/promises");
  await mkdir(join(root, "operations"), { recursive: true, mode: 0o700 });
  const path = join(root, "operations", `${record.deployment_id}.json`);
  const temporary = join("operations", `.${record.deployment_id}.json.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(join(root, temporary), "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(join(root, temporary), path);
}

export async function listIncompleteOperations(root: string): Promise<OperationRecord[]> {
  const { readdir } = await import("node:fs/promises");
  let names: string[] = [];
  try {
    names = await readdir(join(root, "operations"));
  } catch {
    return [];
  }
  const incomplete: OperationRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const record = await readOperation(root, name.replace(/\.json$/, ""));
    if (record && record.stage !== "completed") incomplete.push(record);
  }
  return incomplete;
}
