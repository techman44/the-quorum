"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cronToHuman } from "@/lib/utils";
import { updateAgentConfigAction } from "@/lib/actions";
import type { QuorumAgentConfig } from "@/lib/types";

interface AgentConfigFormProps {
  agentName: string;
  config: QuorumAgentConfig | null;
  defaultSchedule: string;
  defaultPrompt: string;
}

export function AgentConfigForm({
  agentName,
  config,
  defaultSchedule,
  defaultPrompt,
}: AgentConfigFormProps) {
  const [cronSchedule, setCronSchedule] = useState(
    config?.cron_schedule || defaultSchedule
  );
  const [prompt, setPrompt] = useState(config?.prompt || defaultPrompt);
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">(
    "idle"
  );

  function handleSave() {
    setSaveState("idle");
    startTransition(async () => {
      try {
        await updateAgentConfigAction(agentName, {
          cron_schedule: cronSchedule,
          prompt,
          enabled,
        });
        setSaveState("success");
        setTimeout(() => setSaveState("idle"), 3000);
      } catch {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 5000);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="cron-schedule">
          Cron Schedule
        </label>
        <Input
          id="cron-schedule"
          value={cronSchedule}
          onChange={(e) => setCronSchedule(e.target.value)}
          placeholder="*/15 * * * *"
        />
        <p className="text-xs text-muted-foreground">
          {cronToHuman(cronSchedule)}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="prompt">
          Agent Prompt
        </label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          placeholder="Enter the agent's system prompt..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <label className="text-sm font-medium" htmlFor="enabled">
          Enabled
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Configuration"}
        </Button>
        {saveState === "success" && (
          <span className="text-sm text-green-600">
            Configuration saved successfully.
          </span>
        )}
        {saveState === "error" && (
          <span className="text-sm text-red-600">
            Failed to save configuration. Please try again.
          </span>
        )}
      </div>
    </div>
  );
}
