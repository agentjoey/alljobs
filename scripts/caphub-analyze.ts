import { pathToFileURL } from "node:url";
import { captureIdSchema } from "../lib/caphub/domain/schemas";
import type { AnalysisService, AnalysisServiceResult } from "../lib/caphub/service/analyze";

export function parseCaphubAnalyzeArgs(args: readonly string[]): string {
  if (args.length !== 1) throw new Error("Usage: npm run caphub:analyze -- <capture-id>");
  return captureIdSchema.parse(args[0]);
}

export async function runCaphubAnalyze(
  args: readonly string[],
  loadService: () => Promise<Pick<AnalysisService, "start">>
): Promise<AnalysisServiceResult> {
  const captureId = parseCaphubAnalyzeArgs(args);
  const service = await loadService();
  return service.start(captureId);
}

async function main(): Promise<void> {
  throw new Error(
    "Caphub analysis is disabled by default. Invoke runCaphubAnalyze from the server-only Control Host composition."
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub analysis failed"}\n`);
    process.exitCode = 1;
  });
}
