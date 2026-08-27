import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getLocksDir } from "../paths";

export async function withProjectLock<T>(
  slug: string,
  fn: () => Promise<T>,
  root?: string
): Promise<T> {
  const locksDir = getLocksDir(root);
  const lockFile = resolve(locksDir, `${slug}.lock`);

  let fileHandle: any;
  try {
    fileHandle = await open(lockFile, "wx");
    await fileHandle.writeFile(`${process.pid}\n${Date.now()}\n`, "utf8");
  } catch (err: any) {
    if (err.code === "EEXIST") {
      throw new Error(`Project "${slug}" is currently locked by another operation`);
    }
    throw err;
  }

  try {
    return await fn();
  } finally {
    try {
      if (fileHandle) {
        await fileHandle.close();
      }
      await unlink(lockFile);
    } catch {
      // Best-effort cleanup
    }
  }
}
