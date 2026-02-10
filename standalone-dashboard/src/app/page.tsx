import { getStats, getLatestRunPerAgent, listEvents, ensureAgentConfigTable, seedAgentConfigs } from "@/lib/db";
import { AGENTS } from "@/lib/agents";
import { StatsCards } from "@/components/stats-cards";
import { AgentStatusGrid } from "@/components/agent-card";
import { ActivityFeed } from "@/components/activity-feed";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await ensureAgentConfigTable();
  await seedAgentConfigs(AGENTS);

  const [stats, runs, events] = await Promise.all([
    getStats(),
    getLatestRunPerAgent(),
    listEvents({ limit: 20 }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          The Quorum agent overview
        </p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Agents</h2>
          <AgentStatusGrid agents={AGENTS} runs={runs} />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
          <ActivityFeed events={events} />
        </section>
      </div>
    </div>
  );
}
