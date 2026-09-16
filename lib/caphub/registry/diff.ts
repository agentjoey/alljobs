import { registryJsonValueSchema, type RegistryJsonValue } from "./schemas";

export interface RegistryDiffEntry {
  kind: "added" | "removed" | "changed";
  path: string;
  summary: string;
}

const MAX_DIFF_ENTRIES = 200;

function isObject(value: RegistryJsonValue): value is Record<string, RegistryJsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function append(
  output: RegistryDiffEntry[],
  kind: RegistryDiffEntry["kind"],
  path: string
): void {
  if (output.length >= MAX_DIFF_ENTRIES) return;
  output.push({
    kind,
    path,
    summary: kind === "added" ? "Field added" : kind === "removed" ? "Field removed" : "Field changed"
  });
}

function walk(previous: RegistryJsonValue, current: RegistryJsonValue, path: string, output: RegistryDiffEntry[]): void {
  if (Object.is(previous, current) || output.length >= MAX_DIFF_ENTRIES) return;
  if (isObject(previous) && isObject(current)) {
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in previous)) append(output, "added", childPath);
      else if (!(key in current)) append(output, "removed", childPath);
      else walk(previous[key], current[key], childPath, output);
    }
    return;
  }
  if (Array.isArray(previous) && Array.isArray(current)) {
    if (JSON.stringify(previous) !== JSON.stringify(current)) append(output, "changed", path);
    return;
  }
  append(output, "changed", path);
}

export function diffRegistryVersions(
  previous: RegistryJsonValue | null,
  current: RegistryJsonValue
): RegistryDiffEntry[] {
  const parsedCurrent = registryJsonValueSchema.parse(current);
  if (previous === null) return [{ kind: "added", path: "$", summary: "New record" }];
  const parsedPrevious = registryJsonValueSchema.parse(previous);
  const output: RegistryDiffEntry[] = [];
  walk(parsedPrevious, parsedCurrent, "$", output);
  return output;
}
