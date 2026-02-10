'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NewTaskDialog } from '@/components/new-task-dialog';
import { Plus } from 'lucide-react';

export function TasksHeader() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <Button onClick={() => setDialogOpen(true)} size="sm">
        <Plus className="size-4" />
        New Task
      </Button>
      <NewTaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
