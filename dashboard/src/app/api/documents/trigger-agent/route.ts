import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getAgent } from '@/lib/agents';
import { generateAgentChat } from '@/lib/ai/model-selector';
import type { QuorumDocument, QuorumEvent, ChatMessage } from '@/lib/types';

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
    const messages: ChatMessage[] = [
      { role: 'system', content: `You are ${agentDef.displayName}. Analyze the given document and provide your insights.` },
      { role: 'user', content: prompt }
    ];

    const analysis = await generateAgentChat(agent, messages);

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
