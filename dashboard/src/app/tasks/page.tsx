import { listTasks } from '@/lib/db';
import { KanbanBoard } from '@/components/kanban-board';
import { TasksHeader } from '@/components/tasks-header';
import type { QuorumTask } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const allTasks = await listTasks({ limit: 200 });

  const grouped: Record<string, QuorumTask[]> = {
    open: [],
    in_progress: [],
    done: [],
    blocked: [],
  };

  for (const task of allTasks) {
    const bucket = grouped[task.status];
    if (bucket) {
      bucket.push(task);
    } else {
      grouped.open.push(task);
    }
  }

  return (
    <div className="space-y-6">
      <TasksHeader />
      <KanbanBoard tasks={grouped} />
    </div>
  );
}
