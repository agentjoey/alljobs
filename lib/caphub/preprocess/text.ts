import type { PreprocessResult } from "../analysis/types";

type Indicators = PreprocessResult["indicators"];
type PrivacySuggestion = PreprocessResult["privacy_suggestions"][number];

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function extractTextIndicators(texts: readonly string[]): Indicators {
  const urls: string[] = [];
  const repositories: string[] = [];
  const packages: string[] = [];
  const commands: string[] = [];

  for (const text of texts) {
    for (const match of text.matchAll(/https:\/\/[^\s<>()\[\]{}"']+/gu)) {
      const value = match[0].replace(/[.,;:!?]+$/u, "");
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") continue;
        urls.push(url.toString().replace(/\/$/u, ""));
        if (url.hostname.toLowerCase() === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2) {
          repositories.push(url.toString().replace(/[/.]$/u, ""));
        }
      } catch {
        // OCR-like URL candidates that do not parse are ignored.
      }
    }

    for (const match of text.matchAll(/(?:^|\s)(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)\b/giu)) {
      packages.push(match[1]);
    }
    for (const match of text.matchAll(/\b(?:npm|pnpm|yarn)\s+(?:install|add)\s+[^\n\r;]+/giu)) {
      commands.push(match[0].trim());
    }
  }

  return {
    urls: uniqueSorted(urls),
    repositories: uniqueSorted(repositories),
    packages: uniqueSorted(packages),
    commands: uniqueSorted(commands)
  };
}

export function suggestPrivacyReviews(texts: readonly string[], imageIndex: number): PrivacySuggestion[] {
  const kinds = new Set<PrivacySuggestion["kind"]>();
  for (const text of texts) {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text)) kinds.add("email");
    if (/\b(?:sk|token|api[_-]?key)[-_A-Za-z0-9]{12,}\b/iu.test(text)) kinds.add("token_candidate");
    if (/\b(?:\+?\d[\d ()-]{7,}\d)\b/u.test(text)) kinds.add("phone");
  }
  return [...kinds].sort().map((kind) => ({
    image_index: imageIndex,
    kind,
    action: "human_redaction_review" as const
  }));
}
