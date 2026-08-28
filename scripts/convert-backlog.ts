import { readFileSync, writeFileSync } from "node:fs";
import { parseBacklogDocument } from "../lib/planning/markdown/backlog";
import {
  convertLegacyBacklog,
  parseLegacyBacklog
} from "../lib/planning/markdown/legacy-backlog";
import { buildLegacyRoadmap } from "../lib/planning/markdown/legacy-roadmap";
import { renderBacklogItem, renderRoadmapItem } from "../lib/planning/markdown/render";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/convert-backlog.ts <input.md> [--out <path>] [--roadmap-out <path>]"
  );
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  let outPath: string | undefined;
  let roadmapOutPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") {
      outPath = args[++i];
    } else if (arg === "--roadmap-out") {
      roadmapOutPath = args[++i];
    } else if (arg.startsWith("--")) {
      console.error(`[convert-backlog] Unknown option: ${arg}`);
      usage();
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) usage();
  const inputPath = positional[0];

  let source: string;
  try {
    source = readFileSync(inputPath, "utf-8");
  } catch (err: any) {
    console.error(`[convert-backlog] Cannot read "${inputPath}": ${err.message}`);
    process.exit(1);
  }

  // Fast path: the document already parses as canonical AllJobs backlog.
  const canonical = parseBacklogDocument(source, inputPath);
  const missingMetadata = canonical.issues.filter(
    i => i.code === "MISSING_METADATA_BLOCK"
  );
  if (canonical.valid.length > 0 && missingMetadata.length === 0) {
    console.log("[convert-backlog] already canonical");
    process.exit(0);
  }

  const parsed = parseLegacyBacklog(source, inputPath);
  const { items, unmappable } = convertLegacyBacklog(parsed);
  const boundPhases = new Set(items.map(i => i.phase));
  const roadmap = buildLegacyRoadmap(parsed.phases, {
    includeMaintenance: boundPhases.has("maintenance")
  });

  console.log(
    `[convert-backlog] ${items.length} items converted, ${parsed.phases.length} phases found, ` +
      `${parsed.issues.length} parse issues, ${unmappable.length} unmappable`
  );
  for (const issue of parsed.issues) {
    console.log(`  issue [${issue.code}] ${issue.objectId ?? ""}: ${issue.message}`);
  }
  for (const u of unmappable) {
    console.log(`  unmappable: ${u.id}: ${u.reason}`);
  }
  for (const u of roadmap.unmappable) {
    console.log(`  unmappable phase: ${u.id}: ${u.reason}`);
  }

  const backlogText = items.map(renderBacklogItem).join("\n\n") + "\n";
  if (outPath) {
    writeFileSync(outPath, backlogText);
    console.log(`[convert-backlog] backlog written to ${outPath}`);
  } else {
    process.stdout.write(backlogText);
  }

  if (roadmapOutPath) {
    const roadmapText = roadmap.items.map(renderRoadmapItem).join("\n\n") + "\n";
    writeFileSync(roadmapOutPath, roadmapText);
    console.log(`[convert-backlog] roadmap written to ${roadmapOutPath}`);
  }

  if (unmappable.length > 0 || roadmap.unmappable.length > 0) {
    process.exit(1);
  }
}

main();
