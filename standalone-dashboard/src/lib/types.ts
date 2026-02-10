// Types matching the Quorum PostgreSQL schema exactly

export interface QuorumDocument {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

export interface QuorumEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  thread_id?: string | null;
  thread_title?: string | null;
  created_at: Date;
}

export interface QuorumThread {
  id: string;
  thread_id: string;
  title: string;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface QuorumTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  owner: string | null;
  due_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface QuorumAgentRun {
  id: string;
  agent_name: string;
  started_at: Date;
  completed_at: Date | null;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface QuorumAgentConfig {
  agent_name: string;
  display_name: string;
  avatar_url: string | null;
  cron_schedule: string;
  prompt: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at: Date;
}

export interface QuorumStats {
  documents: number;
  events: number;
  tasks: number;
  embeddings: number;
  unembedded_documents: number;
  unembedded_events: number;
}

export interface SearchResult {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
  score: number;
}

export interface QuorumDocumentWithEmbedding extends QuorumDocument {
  has_embedding: boolean;
}

export type QuorumObservationCategory =
  | 'critique'
  | 'risk'
  | 'insight'
  | 'recommendation'
  | 'issue'
  | 'improvement'
  | 'other';

export type QuorumObservationSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type QuorumObservationStatus = 'open' | 'acknowledged' | 'addressed' | 'dismissed';

export type QuorumObservationRefType =
  | 'document'
  | 'task'
  | 'event'
  | 'agent_run'
  | 'observation'
  | null;

export interface QuorumObservation {
  id: string;
  category: QuorumObservationCategory;
  content: string;
  source_agent: string;
  severity: QuorumObservationSeverity;
  status: QuorumObservationStatus;
  ref_id: string | null;
  ref_type: QuorumObservationRefType;
  fingerprint: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateObservationInput {
  category: QuorumObservationCategory;
  content: string;
  source_agent: string;
  severity?: QuorumObservationSeverity;
  status?: QuorumObservationStatus;
  ref_id?: string | null;
  ref_type?: QuorumObservationRefType;
  metadata?: Record<string, unknown>;
}
