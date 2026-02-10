import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getOpenClawPath } from '@/lib/openclaw';

interface OpenClawCronJob {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

function runOpenClawCommand(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getOpenClawPath(), args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn openclaw: ${err.message}`));
    });
  });
}

// GET /api/crons - List all OpenClaw cron jobs
export async function GET() {
  try {
    const { stdout, code } = await runOpenClawCommand(['cron', 'list', '--json']);

    if (code !== 0) {
      return NextResponse.json(
        { error: 'Failed to list cron jobs', details: stdout },
        { status: 500 }
      );
    }

    const data = JSON.parse(stdout) as { jobs: OpenClawCronJob[] };

    // Filter to only Quorum-related jobs
    const quorumJobs = (data.jobs || []).filter((job) =>
      job.name?.startsWith('quorum-')
    );

    return NextResponse.json({ jobs: quorumJobs });
  } catch (err) {
    console.error('Cron list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
