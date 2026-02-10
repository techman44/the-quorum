import { NextRequest, NextResponse } from 'next/server';
import { setAgentModelAssignment, getAgentModelAssignment, listAgentModelAssignments } from '@/lib/db';

// GET /api/settings/agents - List all agent model assignments
export async function GET() {
  try {
    const assignments = await listAgentModelAssignments();

    // Convert snake_case to camelCase for frontend
    const camelCaseAssignments = assignments.map((a: any) => ({
      id: a.id,
      agentName: a.agent_name,
      primaryProviderId: a.primary_provider_id,
      primaryModel: a.primary_model,
      fallbackProviderId: a.fallback_provider_id,
      fallbackModel: a.fallback_model,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));

    return NextResponse.json({ assignments: camelCaseAssignments });
  } catch (err) {
    console.error('Agent assignments list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/settings/agents - Set model assignment for an agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentName, primaryProviderId, primaryModel, fallbackProviderId, fallbackModel } = body as {
      agentName: string;
      primaryProviderId: string;
      primaryModel: string;
      fallbackProviderId?: string;
      fallbackModel?: string;
    };

    if (!agentName || !primaryProviderId || !primaryModel) {
      return NextResponse.json(
        { error: 'Missing required fields: agentName, primaryProviderId, primaryModel' },
        { status: 400 }
      );
    }

    const assignment = await setAgentModelAssignment(
      agentName,
      primaryProviderId,
      primaryModel,
      fallbackProviderId,
      fallbackModel
    );

    // Convert snake_case to camelCase for frontend
    const camelCaseAssignment = {
      id: assignment.id,
      agentName: (assignment as any).agent_name,
      primaryProviderId: (assignment as any).primary_provider_id,
      primaryModel: (assignment as any).primary_model,
      fallbackProviderId: (assignment as any).fallback_provider_id,
      fallbackModel: (assignment as any).fallback_model,
      createdAt: (assignment as any).created_at,
      updatedAt: (assignment as any).updated_at,
    };

    return NextResponse.json({ assignment: camelCaseAssignment });
  } catch (err) {
    console.error('Agent assignment API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
