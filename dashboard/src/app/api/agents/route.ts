import { NextRequest, NextResponse } from 'next/server';
import { discoverAgents, getAgentMetadata, findAgentsByCriteria, setAgentEnabled, registerAgent } from '@/lib/agent-discovery';
import type { AgentMetadata } from '@/lib/agent-schema';

// GET /api/agents - List all agents with metadata
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const specialty = searchParams.get('specialty');
    const capability = searchParams.get('capability');
    const tag = searchParams.get('tag');
    const includeDisabled = searchParams.get('includeDisabled') === 'true';

    let agents: AgentMetadata[];

    if (category || specialty || capability || tag) {
      // Search by criteria
      agents = await findAgentsByCriteria({
        category: category || undefined,
        specialty: specialty || undefined,
        capability: capability || undefined,
        tag: tag || undefined,
      });
    } else {
      // Get all agents
      const allAgents = await discoverAgents();
      agents = includeDisabled ? allAgents : allAgents.filter(a => a.enabled);
    }

    // Return lightweight agent info for UI
    const lightAgents = agents.map(agent => ({
      name: agent.name,
      displayName: agent.displayName,
      icon: agent.icon,
      color: agent.color,
      description: agent.description,
      schedule: agent.schedule || '',
      enabled: agent.enabled,
      category: agent.category,
      specialties: agent.specialties,
      reasonsToCall: agent.reasonsToCall,
      tags: agent.tags,
    }));

    return NextResponse.json({ agents: lightAgents });
  } catch (err) {
    console.error('Agents list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/agents - Register or update a custom agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<AgentMetadata>;

    if (!body.name || !body.displayName) {
      return NextResponse.json(
        { error: 'Missing required fields: name, displayName' },
        { status: 400 }
      );
    }

    // Ensure required fields
    const agentMetadata: AgentMetadata = {
      name: body.name,
      displayName: body.displayName,
      version: body.version || '1.0.0',
      icon: body.icon || 'bot',
      color: body.color || '#6B7280',
      description: body.description || '',
      schedule: body.schedule,
      enabled: body.enabled ?? true,
      specialties: body.specialties || [],
      reasonsToCall: body.reasonsToCall || [],
      capabilities: body.capabilities || [],
      collaboratesWith: body.collaboratesWith || [],
      dependsOn: body.dependsOn || [],
      category: body.category || 'custom',
      requires: body.requires || [],
      tags: body.tags || [],
    };

    const registered = await registerAgent(agentMetadata);

    return NextResponse.json({
      success: true,
      agent: {
        name: registered.name,
        displayName: registered.displayName,
        icon: registered.icon,
        color: registered.color,
        description: registered.description,
        enabled: registered.enabled,
      },
    });
  } catch (err) {
    console.error('Agent registration error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
