import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { pool } from '@/lib/db';
import { getAgent } from '@/lib/agents';
import { getOpenClawPath } from '@/lib/openclaw';
import type { QuorumDocument, QuorumEvent } from '@/lib/types';

function runOpenClaw(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getOpenClawPath(), [
      'agent',
      '--message', message,
      '--session-id', `doc-analysis-${Date.now()}`,
      '--timeout', '120',
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`openclaw exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn openclaw: ${err.message}`));
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { document_id, agent } = body as { document_id: string; agent: string };

    if (!document_id || typeof document_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid document_id' },
        { status: 400 }
      );
    }

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid agent' },
        { status: 400 }
      );
    }

    const agentDef = getAgent(agent);
    if (!agentDef) {
      return NextResponse.json(
        { error: `Unknown agent: ${agent}` },
        { status: 404 }
      );
    }

    const docResult = await pool.query<QuorumDocument>(
      'SELECT * FROM quorum_documents WHERE id = $1',
      [document_id]
    );

    if (docResult.rows.length === 0) {
      return NextResponse.json(
        { error: `Document not found: ${document_id}` },
        { status: 404 }
      );
    }

    const doc = docResult.rows[0];

    const prompt = `Review this document and provide your analysis as ${agentDef.displayName}: Title: ${doc.title}\n\nContent: ${doc.content}`;
    const analysis = await runOpenClaw(prompt);

    const eventResult = await pool.query<QuorumEvent>(
      `INSERT INTO quorum_events (event_type, title, description, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        'agent_analysis',
        `${agentDef.displayName} analysis of "${doc.title}"`,
        analysis,
        JSON.stringify({ source: agent, document_id: doc.id }),
      ]
    );

    return NextResponse.json({
      success: true,
      event_id: eventResult.rows[0].id,
      analysis,
    });
  } catch (err) {
    console.error('Trigger agent API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
