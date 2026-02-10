/**
 * Agent definitions - now using dynamic discovery
 *
 * This file provides backwards compatibility while transitioning
 * to the dynamic agent system.
 */

import { discoverAgents, getAgentRosterEntry } from './agent-discovery';
import type { AgentMetadata, AgentRosterEntry } from './agent-schema';

// Legacy agent type for backwards compatibility
export interface Agent {
  name: string;
  displayName: string;
  color: string;
  schedule: string;
  description: string;
  icon?: string;
}

// Default agents list for fallback (matches the schema defaults)
const DEFAULT_AGENTS: Agent[] = [
  { name: 'connector', displayName: 'The Connector', color: '#3B82F6', schedule: '*/15 * * * *', description: 'Finds non-obvious connections between information', icon: 'link' },
  { name: 'executor', displayName: 'The Executor', color: '#EF4444', schedule: '0 * * * *', description: 'Tracks commitments, deadlines, and accountability', icon: 'gavel' },
  { name: 'strategist', displayName: 'The Strategist', color: '#8B5CF6', schedule: '0 6 * * *', description: 'Daily strategic synthesis and reprioritization', icon: 'compass' },
  { name: 'devils-advocate', displayName: "The Devil's Advocate", color: '#F59E0B', schedule: '0 */4 * * *', description: 'Challenges assumptions and identifies risks', icon: 'alert-triangle' },
  { name: 'opportunist', displayName: 'The Opportunist', color: '#10B981', schedule: '0 */6 * * *', description: 'Finds quick wins and hidden value', icon: 'lightbulb' },
  { name: 'data-collector', displayName: 'The Data Collector', color: '#6366F1', schedule: '*/30 * * * *', description: 'Scans inbox, processes files, verifies system health', icon: 'database' },
  { name: 'closer', displayName: 'The Closer', color: '#F97316', schedule: '*/10 * * * *', description: 'Verifies completion, closes tasks, updates status from evidence', icon: 'check-circle' },
  { name: 'quorum', displayName: 'The Quorum', color: '#0EA5E9', schedule: '', description: 'Council mode - all agents collaborate on your query', icon: 'users' },
];

/**
 * Get all agents (legacy format)
 * Returns default agents for now - will be dynamic once frontend is updated
 */
export function getAgents(): Agent[] {
  return DEFAULT_AGENTS;
}

/**
 * Get an agent by name
 */
export function getAgent(name: string): Agent | undefined {
  return DEFAULT_AGENTS.find(a => a.name === name);
}

/**
 * Get agents with full metadata (for dynamic system)
 */
export async function getAgentsWithMetadata(): Promise<AgentMetadata[]> {
  return await discoverAgents();
}

/**
 * Get a single agent with metadata
 */
export async function getAgentWithMetadata(name: string): Promise<AgentMetadata | null> {
  const agents = await discoverAgents();
  return agents.find(a => a.name === name) || null;
}

/**
 * Get the agent roster for prompt injection
 */
export async function getAgentRoster(): Promise<AgentRosterEntry[]> {
  const agents = await discoverAgents();
  return agents.map(agent => ({
    name: agent.name,
    displayName: agent.displayName,
    specialties: agent.specialties,
    reasonsToCall: agent.reasonsToCall,
    capabilities: agent.capabilities.map(c => c.name),
  }));
}

// Export the default agents list for backwards compatibility
export const AGENTS = DEFAULT_AGENTS;

// Export types
export type { AgentMetadata, AgentRosterEntry } from './agent-schema';
