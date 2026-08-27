import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const skillMdPath = resolve(root, "skills/alljobs-planning/SKILL.md");
const codeRefPath = resolve(root, "skills/alljobs-planning/references/code-project.md");
const bizRefPath = resolve(root, "skills/alljobs-planning/references/business-project.md");
const contractsRefPath = resolve(root, "skills/alljobs-planning/references/contracts.md");

const roadmapExamplePath = resolve(root, "skills/alljobs-planning/examples/ROADMAP.md");
const backlogExamplePath = resolve(root, "skills/alljobs-planning/examples/BACKLOG.md");
const tasksExamplePath = resolve(root, "skills/alljobs-planning/examples/TASKS.md");

console.log("[validate-planning-skill] Checking skill documentation and examples...");

// 1. Check file existence
const requiredFiles = [
  skillMdPath,
  codeRefPath,
  bizRefPath,
  contractsRefPath,
  roadmapExamplePath,
  backlogExamplePath,
  tasksExamplePath
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`[validate-planning-skill] Missing required file: ${file}`);
    process.exit(1);
  }
}

// 2. Validate skill content
const skillContent = readFileSync(skillMdPath, "utf8");
const requiredPhrases = [
  "name: alljobs-planning",
  "Repo-Owned Planning for Code Projects",
  "docs/ROADMAP.md",
  "docs/BACKLOG.md",
  "AllJobs-Native Planning for Business Projects",
  "STALE_WRITE"
];

for (const phrase of requiredPhrases) {
  if (!skillContent.includes(phrase)) {
    console.error(`[validate-planning-skill] SKILL.md missing required concept: "${phrase}"`);
    process.exit(1);
  }
}

console.log("[validate-planning-skill] All planning skill files and behavioral rules validated successfully.");
process.exit(0);
