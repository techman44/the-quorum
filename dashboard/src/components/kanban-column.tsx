'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { TaskCard } from '@/components/task-card';
import type { QuorumTask } from '@/lib/types';

export function KanbanColumn({
  id,
  title,
  tasks,
  color,
}: {
  id: string;
  title: string;
  tasks: QuorumTask[];
  color: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={`flex flex-col rounded-lg border bg-muted/30 min-h-[400px] transition-colors ${
        isOver ? 'bg-muted/60 ring-2 ring-ring/20' : ''
      }`}
    >
      <div
        className="rounded-t-lg px-3 py-2.5 border-b"
        style={{ borderTopWidth: 3, borderTopColor: color }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
            {tasks.length}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={setNodeRef} className="p-2 space-y-2 min-h-[300px]">
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </SortableContext>
        </div>
      </ScrollArea>
    </div>
  );
}
