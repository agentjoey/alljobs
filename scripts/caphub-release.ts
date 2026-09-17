import { pathToFileURL } from "node:url";
import type { LearnKind } from "../lib/caphub/releases/compose";
import type { ReleaseService } from "../lib/caphub/releases/service";

const CANDIDATE_PATTERN = /^cand_[a-f0-9]{32}$/;
const RELEASE_PATTERN = /^rel_[a-f0-9]{32}$/;
const DECISION_PATTERN = /^dec_[a-f0-9]{32}$/;
const LEARN_KINDS = new Set<LearnKind>(["experience_card", "reference"]);

export type CaphubReleaseCommand =
  | { action: "compose"; candidateId: string; decisionId: string; learnKind?: LearnKind }
  | { action: "finalize"; releaseId: string; decisionId: string };

export function parseCaphubReleaseArgs(args: readonly string[]): CaphubReleaseCommand {
  if ((args.length === 5 || args.length === 7) && args[0] === "--compose"
    && args[1] === "--candidate" && CANDIDATE_PATTERN.test(args[2] ?? "")
    && args[3] === "--decision" && DECISION_PATTERN.test(args[4] ?? "")) {
    if (args.length === 5) {
      return { action: "compose", candidateId: args[2] as string, decisionId: args[4] as string };
    }
    if (args[5] === "--learn-kind" && LEARN_KINDS.has(args[6] as LearnKind)) {
      return {
        action: "compose",
        candidateId: args[2] as string,
        decisionId: args[4] as string,
        learnKind: args[6] as LearnKind
      };
    }
  }
  if (args.length === 5 && args[0] === "--finalize"
    && args[1] === "--release" && RELEASE_PATTERN.test(args[2] ?? "")
    && args[3] === "--decision" && DECISION_PATTERN.test(args[4] ?? "")) {
    return { action: "finalize", releaseId: args[2] as string, decisionId: args[4] as string };
  }
  throw new Error(
    "Usage: caphub:release --compose --candidate CANDIDATE_ID --decision DECISION_ID [--learn-kind experience_card|reference] | --finalize --release RELEASE_ID --decision DECISION_ID"
  );
}

type ReleaseOperations = {
  createCandidate(input: Parameters<ReleaseService["createCandidate"]>[0]): Promise<unknown>;
  finalizeApproval(input: Parameters<ReleaseService["finalizeApproval"]>[0]): Promise<unknown>;
};

export async function runCaphubRelease(
  args: readonly string[],
  loadService: () => Promise<ReleaseOperations>
): Promise<unknown> {
  const command = parseCaphubReleaseArgs(args);
  const service = await loadService();
  return command.action === "compose"
    ? service.createCandidate({
      candidateId: command.candidateId,
      approvalDecisionId: command.decisionId,
      ...(command.learnKind ? { learnKind: command.learnKind } : {})
    })
    : service.finalizeApproval({
      releaseId: command.releaseId,
      approvalDecisionId: command.decisionId
    });
}

async function loadFixedService(): Promise<ReleaseOperations> {
  const { loadControlHostReleaseService } = await import("../lib/caphub/releases/runtime");
  return loadControlHostReleaseService();
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadService: () => Promise<ReleaseOperations> = loadFixedService,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubRelease(args, loadService);
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub Release operation failed"}\n`);
    process.exitCode = 1;
  });
}
