import "server-only";

import { ProviderInvocationError } from "./contracts";
import type { KimiStageAdapter, KimiStageRequest, KimiStageResult } from "./kimi";
import { runSandboxedKimi } from "./kimi-runner";

export interface KimiLocalRunResult {
  terminalText: string;
  eventCount: number;
  stdoutBytes: number;
  stderrBytes: number;
  usage: { inputTokens: number; outputTokens: number };
  cleanup: () => Promise<void>;
}

export type KimiLocalRun = (request: KimiStageRequest) => Promise<KimiLocalRunResult>;

export function createKimiLocalRun(options: {
  executablePath: string;
  sourceHome: string;
  agentProfilePath: string;
}): KimiLocalRun {
  return (request) => runSandboxedKimi({
    executablePath: options.executablePath,
    sourceHome: options.sourceHome,
    agentProfilePath: options.agentProfilePath,
    prompt: request.prompt,
    signal: request.signal
  });
}

export class KimiLocalAdapter implements KimiStageAdapter {
  private readonly run: KimiLocalRun;

  constructor(options: { run: KimiLocalRun }) {
    this.run = options.run;
  }

  async generate(request: KimiStageRequest): Promise<KimiStageResult> {
    const result = await this.run(request);
    try {
      let output: unknown;
      try {
        output = JSON.parse(result.terminalText);
      } catch (error) {
        throw new ProviderInvocationError("INVALID_OUTPUT", { cause: error });
      }
      if (request.schema) {
        const parsed = request.schema.safeParse(output);
        if (!parsed.success) throw new ProviderInvocationError("INVALID_OUTPUT");
        output = parsed.data;
      }
      return {
        output,
        usage: result.usage
      };
    } finally {
      await result.cleanup();
    }
  }
}
