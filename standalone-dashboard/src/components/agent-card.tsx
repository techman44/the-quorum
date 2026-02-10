import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agent-avatar";
import { timeAgo, cronToHuman } from "@/lib/utils";
import type { QuorumAgentRun } from "@/lib/types";

interface AgentDef {
  name: string;
  displayName: string;
  color: string;
  schedule: string;
  description: string;
}

interface AgentCardProps {
  agent: AgentDef;
  latestRun: QuorumAgentRun | null;
}

const statusVariant: Record<string, string> = {
  running: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
};

export function AgentCard({ agent, latestRun }: AgentCardProps) {
  return (
    <Card
      className="overflow-hidden py-0"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar agentName={agent.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{agent.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {agent.description}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {latestRun ? (
            <>
              <Badge
                variant="outline"
                className={statusVariant[latestRun.status] ?? ""}
              >
                {latestRun.status}
              </Badge>
              <span>{timeAgo(new Date(latestRun.started_at))}</span>
            </>
          ) : (
            <span className="italic">Never run</span>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Schedule: {cronToHuman(agent.schedule)}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="xs" asChild>
            <Link href={`/agents/${agent.name}`}>View</Link>
          </Button>
          <Button variant="outline" size="xs" asChild>
            <Link href={`/chat/${agent.name}`}>Chat</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentStatusGrid({
  agents,
  runs,
}: {
  agents: ReadonlyArray<AgentDef>;
  runs: QuorumAgentRun[];
}) {
  const runMap = new Map(runs.map((r) => [r.agent_name, r]));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.name}
          agent={agent}
          latestRun={runMap.get(agent.name) ?? null}
        />
      ))}
    </div>
  );
}
