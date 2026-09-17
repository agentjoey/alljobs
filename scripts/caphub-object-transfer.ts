import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type CaphubObjectTransferCommand =
  | { action: "dry-run" }
  | { action: "apply"; expectedSourceDigest: string };

export interface CaphubObjectTransferDependencies {
  plan(): Promise<unknown>;
  apply(expectedSourceDigest: string): Promise<unknown>;
}

export function parseCaphubObjectTransferArgs(args: readonly string[]): CaphubObjectTransferCommand {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return { action: "dry-run" };
  if (args.length === 5 && args[0] === "--apply" && args[1] === "--digest"
    && DIGEST_PATTERN.test(args[2] ?? "") && args[3] === "--confirm" && args[4] === "COPY-CAPHUB-OBJECTS") {
    return { action: "apply", expectedSourceDigest: args[2] as string };
  }
  throw new Error(
    "Usage: caphub:object-transfer [--dry-run] | --apply --digest SHA256 --confirm COPY-CAPHUB-OBJECTS"
  );
}

export async function runCaphubObjectTransfer(
  args: readonly string[],
  dependencies: CaphubObjectTransferDependencies
): Promise<unknown> {
  const command = parseCaphubObjectTransferArgs(args);
  return command.action === "dry-run" ? dependencies.plan() : dependencies.apply(command.expectedSourceDigest);
}

async function loadFixedDependencies(): Promise<CaphubObjectTransferDependencies> {
  const [{ loadControlHostConfig }, transfer, storage, { LocalCaptureObjectStore }] = await Promise.all([
    import("../lib/planning/config"),
    import("../lib/caphub/storage/transfer"),
    import("../lib/caphub/storage/neon-s3"),
    import("../lib/caphub/storage/local-objects")
  ]);
  const resolved = loadControlHostConfig();
  const root = resolved.caphubStateDir as string;
  return {
    plan: async () => {
      const plan = await transfer.planFilesystemObjectTransfer({ root });
      return { sourceDigest: plan.sourceDigest, objectCount: plan.objects.length };
    },
    apply: async (expectedSourceDigest) => {
      const caphub = resolved.config.caphub;
      if (!caphub?.enabled || !caphub.registry.enabled || caphub.storage.mode !== "neon_s3") {
        throw new Error("Caphub Neon Object Storage is not enabled for transfer");
      }
      const environment = storage.parseNeonS3Environment({
        bucket: caphub.storage.bucket,
        refs: caphub.storage,
        env: process.env
      });
      const destination = new storage.NeonS3CaptureObjectStore({
        port: storage.createNeonS3CommandPort(environment)
      });
      return transfer.applyFilesystemObjectTransfer({
        root,
        expectedSourceDigest,
        source: new LocalCaptureObjectStore(root),
        destination
      });
    }
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadDependencies: () => Promise<CaphubObjectTransferDependencies> = loadFixedDependencies,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubObjectTransfer(args, await loadDependencies());
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub object transfer failed"}\n`);
    process.exitCode = 1;
  });
}
