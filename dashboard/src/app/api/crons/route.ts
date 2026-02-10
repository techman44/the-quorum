import { NextResponse } from 'next/server';
import { listAgentConfigs } from '@/lib/db';

interface CronJob {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  agentName: string;
}

// GET /api/crons - List all Quorum agent cron jobs
export async function GET() {
  try {
    const configs = await listAgentConfigs();

    const jobs: CronJob[] = configs.map((config) => ({
      id: config.agent_name,
      name: config.display_name,
      cron: config.cron_schedule,
      enabled: config.enabled,
      agentName: config.agent_name,
    }));

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error('Cron list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
