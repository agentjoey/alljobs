import { pathToFileURL } from "node:url";
import { captureIdSchema } from "../lib/caphub/domain/schemas";
import type {
  ProductionAnalysisResult,
  ProductionAnalysisWorkflow
} from "../lib/caphub/service/production-workflow";

type AnalysisServiceLoader = () => Promise<Pick<ProductionAnalysisWorkflow, "startAndImport">>;

export function parseCaphubAnalyzeArgs(args: readonly string[]): string {
  if (args.length !== 1) throw new Error("Usage: npm run caphub:analyze -- <capture-id>");
  return captureIdSchema.parse(args[0]);
}

export async function runCaphubAnalyze(
  args: readonly string[],
  loadService: AnalysisServiceLoader
): Promise<ProductionAnalysisResult> {
  const captureId = parseCaphubAnalyzeArgs(args);
  const service = await loadService();
  return service.startAndImport(captureId);
}

async function loadFixedControlHostService(): Promise<Pick<ProductionAnalysisWorkflow, "startAndImport">> {
  const { loadControlHostProductionWorkflow } = await import("../lib/caphub/service/production-workflow");
  return loadControlHostProductionWorkflow();
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadService: AnalysisServiceLoader = loadFixedControlHostService,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubAnalyze(args, loadService);
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub analysis failed"}\n`);
    process.exitCode = 1;
  });
}
