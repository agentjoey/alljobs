import type { Task } from "../domain/types";
import { NativePlanningStore } from "../native/store";

export async function getUniversalTasks(
  options: { root?: string; project?: string; status?: string } = {}
): Promise<Task[]> {
  const store = new NativePlanningStore(options.root);
  const projects = await store.listProjects();

  const allTasks: Task[] = [];
  for (const p of projects) {
    if (p.archived) continue;
    if (options.project && p.slug !== options.project) continue;

    const { tasks } = await store.readTasks(p.slug);
    for (const t of tasks) {
      if (options.status && t.status !== options.status) continue;
      allTasks.push(t);
    }
  }

  return allTasks;
}
