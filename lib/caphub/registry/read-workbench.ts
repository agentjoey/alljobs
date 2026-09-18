import "server-only";
import type { Pool } from "pg";
import { loadControlHostConfig } from "../../planning/config";
import { loadControlHostRegistryRuntime } from "./runtime";

export async function readWorkbench<T>(read: (pool: Pool) => Promise<T>): Promise<{ state: "ready"; data: T } | { state: "disabled" | "unavailable" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resolved=loadControlHostConfig();
    if (!resolved.config.caphub?.enabled || !resolved.config.caphub.registry.enabled) return {state:"disabled"};
    const data=await Promise.race([
      loadControlHostRegistryRuntime({resolved}).then(runtime=>read(runtime.pool)),
      new Promise<never>((_,reject)=>{ timer=setTimeout(()=>reject(new Error("READ_TIMEOUT")),4500); })
    ]);
    return {state:"ready",data};
  } catch { return {state:"unavailable"}; }
  finally { clearTimeout(timer); }
}
