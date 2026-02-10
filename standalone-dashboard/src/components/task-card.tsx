'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TaskDialog } from '@/components/task-dialog';
import type { QuorumTask } from '@/lib/types';
import { GripVertical } from 'lucide-react';

const priorityConfig: Record<string, { color: string; label: string }> = {
  critical: { color: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Critical' },
  high: { color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', label: 'High' },
  medium: { color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Medium' },
  low: { color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400', label: 'Low' },
};

export function TaskCard({ task }: { task: QuorumTask }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = priorityConfig[task.priority] ?? priorityConfig.medium;

  const formatDue = (date: Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dueText = formatDue(task.due_at);
  const isOverdue = task.due_at && new Date(task.due_at) < new Date();

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className={`cursor-pointer py-3 px-3 gap-2 transition-shadow hover:shadow-md ${
          isDragging ? 'opacity-50 shadow-lg' : ''
        }`}
        onClick={() => setDialogOpen(true)}
      >
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-sm font-medium leading-tight truncate">{task.title}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priority.color}`}>
                {priority.label}
              </Badge>
              {task.owner && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                  {task.owner}
                </span>
              )}
              {dueText && (
                <span
                  className={`text-[11px] ${
                    isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {dueText}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <TaskDialog
        task={task}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
