export interface FilenameHead {
  filenameKey: string;
  captureId: string;
  digest: string;
  version: number;
}

export type RequestState = "queued" | "running" | "waiting_for_review" | "needs_attention" | "completed";
export interface AnalysisLease {
  captureId: string;
  contract: "caphub-analysis-v4";
  ownerToken: string;
}
