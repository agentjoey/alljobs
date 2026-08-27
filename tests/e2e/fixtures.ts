import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function setupTestEnvironment(): { homeDir: string; dataDir: string } {
  const homeDir = mkdtempSync(join(tmpdir(), "alljobs-e2e-home-"));
  const dataDir = mkdtempSync(join(tmpdir(), "alljobs-e2e-data-"));

  // Write config.json
  const config = {
    trustedCodeRoots: ["/tmp"],
    refreshIntervalSeconds: 300
  };
  writeFileSync(join(homeDir, "config.json"), JSON.stringify(config, null, 2), "utf8");

  // Create data subdirs
  mkdirSync(join(dataDir, "projects"), { recursive: true });
  mkdirSync(join(dataDir, "roadmaps"), { recursive: true });
  mkdirSync(join(dataDir, "tasks"), { recursive: true });
  mkdirSync(join(dataDir, "log"), { recursive: true });

  // Create sample business project
  const bizProject = {
    slug: "sea-launch",
    name: "Southeast Asia Launch",
    type: "business",
    work_modes: ["operations"],
    execution_locations: [],
    archived: false
  };
  writeFileSync(join(dataDir, "projects/sea-launch.json"), JSON.stringify(bizProject, null, 2), "utf8");

  // Create sample business roadmap
  const roadmapMd = `# Southeast Asia Launch Roadmap

## m-01: Initial Framing
\`\`\`yaml alljobs
id: m-01
kind: milestone
status: done
order: 10
\`\`\`

## m-02: Partner Validation
\`\`\`yaml alljobs
id: m-02
kind: milestone
status: active
order: 20
focus: primary
\`\`\`
`;
  writeFileSync(join(dataDir, "roadmaps/sea-launch.md"), roadmapMd, "utf8");

  // Create sample task
  const tasksMd = `# Tasks

## AJ-T-118: Follow up distributor shortlist
\`\`\`yaml alljobs
id: AJ-T-118
project: sea-launch
status: waiting
roadmap_item: m-02
waiting_on: Northstar Trading
source:
  provider: native
\`\`\`
`;
  writeFileSync(join(dataDir, "tasks/sea-launch.md"), tasksMd, "utf8");

  return { homeDir, dataDir };
}
