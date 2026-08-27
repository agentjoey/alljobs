import Link from "next/link";
import { TaskList } from "@/components/planning/task-list";
import { getUniversalTasks } from "@/lib/planning/queries/tasks";

export default async function TasksPage() {
  const tasks = await getUniversalTasks();

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Tasks</h1>
          <p className="view-subtitle">Cross-project task ledger with quick status tracking and relation links.</p>
        </div>
      </div>

      <TaskList tasks={tasks} />
    </div>
  );
}
