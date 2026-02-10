'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from '@/components/kanban-column';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { updateTaskStatus } from '@/lib/actions';
import type { QuorumTask } from '@/lib/types';

const COLUMNS = [
  { id: 'open', title: 'Open', color: '#3B82F6' },
  { id: 'in_progress', title: 'In Progress', color: '#F59E0B' },
  { id: 'done', title: 'Done', color: '#10B981' },
  { id: 'blocked', title: 'Blocked', color: '#EF4444' },
] as const;

const priorityConfig: Record<string, { color: string; label: string }> = {
  critical: { color: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Critical' },
  high: { color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', label: 'High' },
  medium: { color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Medium' },
  low: { color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400', label: 'Low' },
};

type ColumnId = (typeof COLUMNS)[number]['id'];

export function KanbanBoard({
  tasks,
}: {
  tasks: Record<string, QuorumTask[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [columns, setColumns] = useState<Record<string, QuorumTask[]>>(tasks);
  const [activeTask, setActiveTask] = useState<QuorumTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const findColumn = (taskId: string): ColumnId | null => {
    for (const col of COLUMNS) {
      if (columns[col.id]?.some((t) => t.id === taskId)) {
        return col.id;
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = String(event.active.id);
    const colId = findColumn(taskId);
    if (!colId) return;
    const task = columns[colId].find((t) => t.id === taskId);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceCol = findColumn(activeId);
    // over.id might be a column id or a task id
    let destCol = COLUMNS.find((c) => c.id === overId)?.id ?? findColumn(overId);

    if (!sourceCol || !destCol || sourceCol === destCol) return;

    setColumns((prev) => {
      const sourceTasks = prev[sourceCol].filter((t) => t.id !== activeId);
      const movedTask = prev[sourceCol].find((t) => t.id === activeId);
      if (!movedTask) return prev;

      const destTasks = [...(prev[destCol!] ?? []), { ...movedTask, status: destCol! }];

      return { ...prev, [sourceCol]: sourceTasks, [destCol!]: destTasks };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceCol = findColumn(activeId);
    if (!sourceCol) return;

    // Handle reordering within the same column
    if (sourceCol === findColumn(overId)) {
      const colTasks = columns[sourceCol];
      const oldIndex = colTasks.findIndex((t) => t.id === activeId);
      const newIndex = colTasks.findIndex((t) => t.id === overId);
      if (oldIndex !== newIndex && newIndex !== -1) {
        setColumns((prev) => ({
          ...prev,
          [sourceCol]: arrayMove(prev[sourceCol], oldIndex, newIndex),
        }));
      }
      return;
    }

    // Cross-column move was already handled in handleDragOver
    // Now persist the status change
    const task = columns[sourceCol]?.find((t) => t.id === activeId);
    if (!task) return;

    const newStatus = task.status;
    const snapshot = { ...columns };

    startTransition(async () => {
      try {
        await updateTaskStatus(activeId, newStatus);
        router.refresh();
      } catch {
        setColumns(snapshot);
      }
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            tasks={columns[col.id] ?? []}
            color={col.color}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <Card className="py-3 px-3 gap-2 shadow-xl opacity-90 rotate-2">
            <p className="text-sm font-medium truncate">{activeTask.title}</p>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${
                (priorityConfig[activeTask.priority] ?? priorityConfig.medium).color
              }`}
            >
              {(priorityConfig[activeTask.priority] ?? priorityConfig.medium).label}
            </Badge>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
