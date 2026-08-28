import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseProjectRegistry } from "../domain/schemas";
import type { ProjectRegistryEntry } from "../domain/types";
import { computeDigest } from "./digest";
import { withProjectLockGuard } from "./lock";
import { recordActivity } from "./activity";
import { getProjectFilePath } from "../paths";
import { atomicWriteFile, type MutationResult } from "./store";

export async function setProjectArchivedState(
  slug: string,
  archived: boolean,
  expectedDigest?: string,
  root?: string
): Promise<MutationResult<ProjectRegistryEntry>> {
  const filePath = getProjectFilePath(slug, root);
  if (!existsSync(filePath)) {
    return { ok: false, code: "NOT_FOUND", message: `Project "${slug}" not found` };
  }

  return withProjectLockGuard(
    slug,
    async () => {
      const content = await readFile(filePath, "utf8");
      const currentDigest = computeDigest(content.trim());

      if (expectedDigest && expectedDigest !== currentDigest) {
        return {
          ok: false,
          code: "STALE_WRITE",
          message: `Expected digest "${expectedDigest}" does not match current digest "${currentDigest}"`
        };
      }

      let parsed: ProjectRegistryEntry;
      try {
        parsed = parseProjectRegistry(JSON.parse(content));
      } catch (err: any) {
        return { ok: false, code: "VALIDATION_ERROR", message: err.message };
      }

      parsed.archived = archived;
      const updatedJson = `${JSON.stringify(parsed, null, 2)}\n`;
      try {
        await atomicWriteFile(filePath, updatedJson);
      } catch (err: any) {
        return {
          ok: false,
          code: "FILESYSTEM_ERROR",
          message: `Failed to write project registry: ${err.message}`
        };
      }
      const newDigest = computeDigest(updatedJson.trim());

      await recordActivity(
        {
          type: archived ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED",
          project: slug,
          details: { archived }
        },
        root
      );

      return { ok: true, value: parsed, digest: newDigest };
    },
    root
  );
}
