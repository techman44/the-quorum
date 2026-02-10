'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { toggleAgentEnabled } from '@/lib/actions';

export function AgentToggle({
  agentName,
  enabled,
}: {
  agentName: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Switch
      checked={enabled}
      disabled={isPending}
      onCheckedChange={(checked: boolean) => {
        startTransition(async () => {
          await toggleAgentEnabled(agentName, checked);
          router.refresh();
        });
      }}
    />
  );
}
