import { NextRequest, NextResponse } from 'next/server';
import { getAgentMetadata, setAgentEnabled } from '@/lib/agent-discovery';

// GET /api/agents/[name] - Get detailed agent metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const agent = await getAgentMetadata(name);

    if (!agent) {
      return NextResponse.json(
        { error: `Agent not found: ${name}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ agent });
  } catch (err) {
    console.error('Agent get API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/agents/[name] - Update agent (enable/disable)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json() as { enabled?: boolean };

    if (body.enabled !== undefined) {
      await setAgentEnabled(name, body.enabled);
    }

    const agent = await getAgentMetadata(name);

    if (!agent) {
      return NextResponse.json(
        { error: `Agent not found: ${name}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        name: agent.name,
        displayName: agent.displayName,
        enabled: agent.enabled,
      },
    });
  } catch (err) {
    console.error('Agent update API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
