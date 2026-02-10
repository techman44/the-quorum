import { createHash } from 'crypto';
import { Pool } from 'pg';
import type {
  QuorumDocument,
  QuorumDocumentWithEmbedding,
  QuorumEvent,
  QuorumTask,
  QuorumAgentRun,
  QuorumAgentConfig,
  QuorumStats,
  QuorumObservation,
  QuorumThread,
} from './types';

// ─── Connection Pool ────────────────────────────────────────────────────────

export const pool = new Pool({
  host: process.env.QUORUM_DB_HOST ?? '192.168.20.150',
  port: parseInt(process.env.QUORUM_DB_PORT ?? '5432', 10),
  database: process.env.QUORUM_DB_NAME ?? 'quorum',
  user: process.env.QUORUM_DB_USER ?? 'quorum',
  password: process.env.QUORUM_DB_PASSWORD ?? '',
  max: 10,
});

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getStats(): Promise<QuorumStats> {
  const [docs, events, tasks, embeds, unembDocs, unembEvents] = await Promise.all([
    pool.query('SELECT count(*)::int AS n FROM quorum_documents'),
    pool.query('SELECT count(*)::int AS n FROM quorum_events'),
    pool.query('SELECT count(*)::int AS n FROM quorum_tasks'),
    pool.query('SELECT count(*)::int AS n FROM quorum_embeddings'),
    pool.query(
      `SELECT count(*)::int AS n FROM quorum_documents d
       LEFT JOIN quorum_embeddings e
         ON e.ref_id = d.id
         AND (e.ref_type = 'document' OR e.ref_type LIKE 'document_chunk_%')
       WHERE e.id IS NULL`
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM quorum_events ev
       LEFT JOIN quorum_embeddings e
         ON e.ref_id = ev.id
         AND (e.ref_type = 'event' OR e.ref_type LIKE 'event_chunk_%')
       WHERE e.id IS NULL`
    ),
  ]);

  return {
    documents: docs.rows[0].n,
    events: events.rows[0].n,
    tasks: tasks.rows[0].n,
    embeddings: embeds.rows[0].n,
    unembedded_documents: unembDocs.rows[0].n,
    unembedded_events: unembEvents.rows[0].n,
  };
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export async function listTasks(opts: {
  status?: string;
  priority?: string;
  owner?: string;
  limit?: number;
}): Promise<QuorumTask[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }
  if (opts.priority) {
    conditions.push(`priority = $${paramIdx}`);
    params.push(opts.priority);
    paramIdx++;
  }
  if (opts.owner) {
    conditions.push(`owner = $${paramIdx}`);
    params.push(opts.owner);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const priorityOrder = `CASE priority
    WHEN 'critical' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
    ELSE 4
  END`;

  const result = await pool.query<QuorumTask>(
    `SELECT * FROM quorum_tasks
     ${whereClause}
     ORDER BY ${priorityOrder} ASC, due_at ASC NULLS LAST, created_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

export async function getTask(id: string): Promise<QuorumTask | null> {
  const result = await pool.query<QuorumTask>(
    'SELECT * FROM quorum_tasks WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createTask(task: {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  owner?: string;
  due_at?: string;
  metadata?: Record<string, unknown>;
}): Promise<QuorumTask> {
  const result = await pool.query<QuorumTask>(
    `INSERT INTO quorum_tasks (title, description, status, priority, owner, due_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      task.title,
      task.description ?? '',
      task.status ?? 'open',
      task.priority ?? 'medium',
      task.owner ?? null,
      task.due_at ?? null,
      JSON.stringify(task.metadata ?? {}),
    ]
  );
  return result.rows[0];
}

export async function updateTask(
  id: string,
  updates: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    owner?: string | null;
    due_at?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<QuorumTask | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIdx}`);
    params.push(updates.title);
    paramIdx++;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIdx}`);
    params.push(updates.description);
    paramIdx++;
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx}`);
    params.push(updates.status);
    paramIdx++;
  }
  if (updates.priority !== undefined) {
    setClauses.push(`priority = $${paramIdx}`);
    params.push(updates.priority);
    paramIdx++;
  }
  if (updates.owner !== undefined) {
    setClauses.push(`owner = $${paramIdx}`);
    params.push(updates.owner);
    paramIdx++;
  }
  if (updates.due_at !== undefined) {
    setClauses.push(`due_at = $${paramIdx}`);
    params.push(updates.due_at);
    paramIdx++;
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx}`);
    params.push(JSON.stringify(updates.metadata));
    paramIdx++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = now()');
  params.push(id);

  const result = await pool.query<QuorumTask>(
    `UPDATE quorum_tasks SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    params
  );
  return result.rows[0] ?? null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM quorum_tasks WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export async function listEvents(opts: {
  event_type?: string;
  limit?: number;
  since?: Date;
}): Promise<QuorumEvent[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.event_type) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(opts.event_type);
    paramIdx++;
  }

  if (opts.since) {
    conditions.push(`created_at >= $${paramIdx}`);
    params.push(opts.since.toISOString());
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<QuorumEvent>(
    `SELECT * FROM quorum_events
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

// ─── Agent Runs ─────────────────────────────────────────────────────────────

export async function listAgentRuns(opts: {
  agent_name?: string;
  status?: string;
  limit?: number;
}): Promise<QuorumAgentRun[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.agent_name) {
    conditions.push(`agent_name = $${paramIdx}`);
    params.push(opts.agent_name);
    paramIdx++;
  }

  if (opts.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<QuorumAgentRun>(
    `SELECT * FROM quorum_agent_runs
     ${whereClause}
     ORDER BY started_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

export async function getLatestRunPerAgent(): Promise<QuorumAgentRun[]> {
  const result = await pool.query<QuorumAgentRun>(
    `SELECT DISTINCT ON (agent_name) *
     FROM quorum_agent_runs
     ORDER BY agent_name, started_at DESC`
  );
  return result.rows;
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function listDocuments(opts: {
  doc_type?: string;
  limit?: number;
}): Promise<QuorumDocument[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.doc_type) {
    conditions.push(`doc_type = $${paramIdx}`);
    params.push(opts.doc_type);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<QuorumDocument>(
    `SELECT * FROM quorum_documents
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

// ─── Agent Config ───────────────────────────────────────────────────────────

export async function ensureAgentConfigTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quorum_agent_config (
      agent_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      cron_schedule TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      settings JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function getAgentConfig(name: string): Promise<QuorumAgentConfig | null> {
  const result = await pool.query<QuorumAgentConfig>(
    'SELECT * FROM quorum_agent_config WHERE agent_name = $1',
    [name]
  );
  return result.rows[0] ?? null;
}

export async function updateAgentConfig(
  name: string,
  updates: {
    display_name?: string;
    avatar_url?: string | null;
    cron_schedule?: string;
    prompt?: string;
    enabled?: boolean;
    settings?: Record<string, unknown>;
  }
): Promise<QuorumAgentConfig | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIdx}`);
    params.push(updates.display_name);
    paramIdx++;
  }
  if (updates.avatar_url !== undefined) {
    setClauses.push(`avatar_url = $${paramIdx}`);
    params.push(updates.avatar_url);
    paramIdx++;
  }
  if (updates.cron_schedule !== undefined) {
    setClauses.push(`cron_schedule = $${paramIdx}`);
    params.push(updates.cron_schedule);
    paramIdx++;
  }
  if (updates.prompt !== undefined) {
    setClauses.push(`prompt = $${paramIdx}`);
    params.push(updates.prompt);
    paramIdx++;
  }
  if (updates.enabled !== undefined) {
    setClauses.push(`enabled = $${paramIdx}`);
    params.push(updates.enabled);
    paramIdx++;
  }
  if (updates.settings !== undefined) {
    setClauses.push(`settings = $${paramIdx}`);
    params.push(JSON.stringify(updates.settings));
    paramIdx++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = now()');
  params.push(name);

  const result = await pool.query<QuorumAgentConfig>(
    `UPDATE quorum_agent_config SET ${setClauses.join(', ')} WHERE agent_name = $${paramIdx} RETURNING *`,
    params
  );
  return result.rows[0] ?? null;
}

export async function listAgentConfigs(): Promise<QuorumAgentConfig[]> {
  const result = await pool.query<QuorumAgentConfig>(
    'SELECT * FROM quorum_agent_config ORDER BY agent_name'
  );
  return result.rows;
}

export async function seedAgentConfigs(
  agents: ReadonlyArray<{ name: string; displayName: string; schedule: string }>
): Promise<void> {
  for (const agent of agents) {
    await pool.query(
      `INSERT INTO quorum_agent_config (agent_name, display_name, cron_schedule)
       VALUES ($1, $2, $3)
       ON CONFLICT (agent_name) DO NOTHING`,
      [agent.name, agent.displayName, agent.schedule]
    );
  }
}

// ─── Documents (extended) ────────────────────────────────────────────────────

export async function searchDocuments(
  query: string,
  opts: { doc_type?: string; limit?: number } = {}
): Promise<QuorumDocument[]> {
  const conditions: string[] = ['(title ILIKE $1 OR content ILIKE $1)'];
  const params: unknown[] = [`%${query}%`];
  let paramIdx = 2;

  if (opts.doc_type) {
    conditions.push(`doc_type = $${paramIdx}`);
    params.push(opts.doc_type);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const result = await pool.query<QuorumDocument>(
    `SELECT * FROM quorum_documents
     WHERE ${conditions.join(' AND ')}
     ORDER BY updated_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

export async function getDocumentWithEmbeddingStatus(
  docId: string
): Promise<QuorumDocumentWithEmbedding | null> {
  const result = await pool.query<QuorumDocumentWithEmbedding>(
    `SELECT d.*,
       EXISTS(
         SELECT 1 FROM quorum_embeddings e
         WHERE e.ref_id = d.id
           AND (e.ref_type = 'document' OR e.ref_type LIKE 'document_chunk_%')
       ) AS has_embedding
     FROM quorum_documents d
     WHERE d.id = $1`,
    [docId]
  );
  return result.rows[0] ?? null;
}

export async function listDocumentsWithEmbeddingStatus(
  opts: { doc_type?: string; limit?: number } = {}
): Promise<QuorumDocumentWithEmbedding[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.doc_type) {
    conditions.push(`d.doc_type = $${paramIdx}`);
    params.push(opts.doc_type);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<QuorumDocumentWithEmbedding>(
    `SELECT d.*,
       EXISTS(
         SELECT 1 FROM quorum_embeddings e
         WHERE e.ref_id = d.id
           AND (e.ref_type = 'document' OR e.ref_type LIKE 'document_chunk_%')
       ) AS has_embedding
     FROM quorum_documents d
     ${whereClause}
     ORDER BY d.updated_at DESC
     LIMIT $${paramIdx}`,
    params
  );
  return result.rows;
}

export async function storeDocumentFromUpload(doc: {
  title: string;
  content: string;
  doc_type: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}): Promise<QuorumDocument> {
  const result = await pool.query<QuorumDocument>(
    `INSERT INTO quorum_documents (title, content, doc_type, metadata, tags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      doc.title,
      doc.content,
      doc.doc_type,
      JSON.stringify(doc.metadata ?? {}),
      doc.tags ?? [],
    ]
  );
  return result.rows[0];
}

export async function deleteDocument(id: string): Promise<boolean> {
  await pool.query(
    `DELETE FROM quorum_embeddings
     WHERE ref_id = $1
       AND (ref_type = 'document' OR ref_type LIKE 'document_chunk_%')`,
    [id]
  );
  const result = await pool.query('DELETE FROM quorum_documents WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function generateAndStoreEmbedding(
  docId: string,
  content: string
): Promise<boolean> {
  const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

  // Clear any existing embeddings for this document
  await pool.query(
    `DELETE FROM quorum_embeddings
     WHERE ref_id = $1
       AND (ref_type = 'document' OR ref_type LIKE 'document_chunk_%')`,
    [docId]
  );

  const needsChunking = content.length > 2000;
  const chunks = needsChunking ? chunkText(content, 500, 50) : [content];

  for (let i = 0; i < chunks.length; i++) {
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mxbai-embed-large', prompt: chunks[i] }),
    });

    if (!response.ok) {
      console.error(`Embedding request failed for chunk ${i}: ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    const embedding = data.embedding as number[];

    const refType = chunks.length === 1 ? 'document' : `document_chunk_${i}`;
    const contentHash = createHash('sha256').update(chunks[i]).digest('hex');

    await pool.query(
      `INSERT INTO quorum_embeddings (ref_id, ref_type, embedding, content_hash)
       VALUES ($1, $2, $3::vector, $4)
       ON CONFLICT (ref_type, ref_id) DO UPDATE SET
         embedding = EXCLUDED.embedding,
         content_hash = EXCLUDED.content_hash,
         created_at = now()`,
      [docId, refType, `[${embedding.join(',')}]`, contentHash]
    );
  }

  return true;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function storeChatMessage(
  agent: string,
  message: string,
  sender: 'user' | 'agent'
): Promise<QuorumEvent> {
  const eventType = sender === 'user' ? 'chat_message' : 'chat_response';
  const result = await pool.query<QuorumEvent>(
    `INSERT INTO quorum_events (event_type, title, description, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      eventType,
      `Chat ${sender === 'user' ? 'to' : 'from'} ${agent}`,
      message,
      JSON.stringify({ target_agent: agent, sender }),
    ]
  );
  return result.rows[0];
}

export async function getChatHistory(
  agent: string,
  limit: number = 50
): Promise<QuorumEvent[]> {
  const result = await pool.query<QuorumEvent>(
    `SELECT * FROM quorum_events
     WHERE event_type IN ('chat_message', 'chat_response')
       AND metadata->>'target_agent' = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [agent, limit]
  );
  return result.rows;
}

// ─── Quorum Council Chat ────────────────────────────────────────────────────

export async function storeQuorumMessage(
  message: string,
  sender: 'user' | 'council',
  threadId: string | null = null,
  threadTitle: string | null = null
): Promise<QuorumEvent> {
  const eventType = sender === 'user' ? 'quorum_chat' : 'quorum_response';
  const result = await pool.query<QuorumEvent>(
    `INSERT INTO quorum_events (event_type, title, description, metadata, thread_id, thread_title)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      eventType,
      sender === 'user' ? 'Chat to The Quorum' : 'Response from The Quorum',
      message,
      JSON.stringify({ target_agent: 'quorum', sender }),
      threadId,
      threadTitle,
    ]
  );
  return result.rows[0];
}

export async function getQuorumChatHistory(
  threadId: string | null = null,
  limit: number = 50
): Promise<QuorumEvent[]> {
  let query = `SELECT * FROM quorum_events
     WHERE event_type IN ('quorum_chat', 'quorum_response')`;
  const params: unknown[] = [];

  if (threadId) {
    query += ` AND thread_id = $1`;
    params.push(threadId);
    params.push(limit);
    query += ` ORDER BY created_at ASC LIMIT $2`;
  } else {
    // For backward compatibility, include messages without a thread
    query += ` AND (thread_id IS NULL OR thread_id = 'default')`;
    params.push(limit);
    query += ` ORDER BY created_at ASC LIMIT $1`;
  }

  const result = await pool.query<QuorumEvent>(query, params);
  return result.rows;
}

// ─── Quorum Threads ────────────────────────────────────────────────────────────

export async function listQuorumThreads(): Promise<QuorumThread[]> {
  const result = await pool.query<QuorumThread>(
    `SELECT
       MIN(id::text)::uuid as id,
       COALESCE(thread_id, 'default') as thread_id,
       COALESCE(thread_title, 'Default Conversation') as title,
       COUNT(*) as message_count,
       MIN(created_at) as created_at,
       MAX(created_at) as updated_at
     FROM quorum_events
     WHERE event_type IN ('quorum_chat', 'quorum_response')
     GROUP BY COALESCE(thread_id, 'default'), COALESCE(thread_title, 'Default Conversation')
     ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getQuorumThread(threadId: string): Promise<QuorumThread | null> {
  const result = await pool.query<QuorumThread>(
    `SELECT
       MIN(id::text)::uuid as id,
       COALESCE(thread_id, 'default') as thread_id,
       COALESCE(thread_title, 'Default Conversation') as title,
       COUNT(*) as message_count,
       MIN(created_at) as created_at,
       MAX(created_at) as updated_at
     FROM quorum_events
     WHERE event_type IN ('quorum_chat', 'quorum_response')
       AND COALESCE(thread_id, 'default') = $1
     GROUP BY COALESCE(thread_id, 'default'), COALESCE(thread_title, 'Default Conversation')`,
    [threadId]
  );
  return result.rows[0] ?? null;
}

export async function createQuorumThread(
  title: string = 'New Conversation'
): Promise<{ threadId: string; title: string }> {
  const threadId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return { threadId, title };
}

export async function renameQuorumThread(
  threadId: string,
  newTitle: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE quorum_events
     SET thread_title = $1
     WHERE event_type IN ('quorum_chat', 'quorum_response')
       AND COALESCE(thread_id, 'default') = $2`,
    [newTitle, threadId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteQuorumThread(threadId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM quorum_events
     WHERE event_type IN ('quorum_chat', 'quorum_response')
       AND COALESCE(thread_id, 'default') = $1`,
    [threadId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Document Analyses ─────────────────────────────────────────────────────────

export interface DocumentAnalysis {
  id: string;
  event_type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  agent_name: string;
}

export async function getDocumentAnalyses(
  documentId: string,
  limit: number = 10
): Promise<DocumentAnalysis[]> {
  const result = await pool.query<DocumentAnalysis>(
    `SELECT
      e.id,
      e.event_type,
      e.title,
      e.description,
      e.metadata,
      e.created_at,
      COALESCE(e.metadata->>'source', e.metadata->>'agent_name', 'unknown') as agent_name
     FROM quorum_events e
     WHERE e.event_type = 'agent_analysis'
       AND e.metadata->>'document_id' = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [documentId, limit]
  );
  return result.rows;
}

// ─── Observations ─────────────────────────────────────────────────────────────

export interface ListObservationsOptions {
  category?: string;
  status?: string;
  severity?: string;
  source_agent?: string;
  ref_id?: string;
  ref_type?: string;
  limit?: number;
  offset?: number;
}

export async function listObservations(
  opts: ListObservationsOptions = {}
): Promise<QuorumObservation[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.category) {
    conditions.push(`category = $${paramIdx}`);
    params.push(opts.category);
    paramIdx++;
  }
  if (opts.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }
  if (opts.severity) {
    conditions.push(`severity = $${paramIdx}`);
    params.push(opts.severity);
    paramIdx++;
  }
  if (opts.source_agent) {
    conditions.push(`source_agent = $${paramIdx}`);
    params.push(opts.source_agent);
    paramIdx++;
  }
  if (opts.ref_id) {
    conditions.push(`ref_id = $${paramIdx}`);
    params.push(opts.ref_id);
    paramIdx++;
  }
  if (opts.ref_type) {
    conditions.push(`ref_type = $${paramIdx}`);
    params.push(opts.ref_type);
    paramIdx++;
  }

  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit);
  params.push(offset);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<QuorumObservation>(
    `SELECT * FROM quorum_observations
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );
  return result.rows;
}

export async function getObservation(id: string): Promise<QuorumObservation | null> {
  const result = await pool.query<QuorumObservation>(
    'SELECT * FROM quorum_observations WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createObservation(data: {
  category: string;
  content: string;
  source_agent: string;
  severity?: string;
  status?: string;
  ref_id?: string | null;
  ref_type?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<QuorumObservation> {
  // Generate fingerprint for deduplication
  const fingerprintData = `${data.category}:${data.source_agent}:${data.content}`;
  const fingerprint = createHash('sha256').update(fingerprintData).digest('hex');

  const result = await pool.query<QuorumObservation>(
    `INSERT INTO quorum_observations (category, content, source_agent, severity, status, ref_id, ref_type, fingerprint, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (fingerprint) DO UPDATE SET
       content = EXCLUDED.content,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      data.category,
      data.content,
      data.source_agent,
      data.severity ?? 'info',
      data.status ?? 'open',
      data.ref_id ?? null,
      data.ref_type ?? null,
      fingerprint,
      JSON.stringify(data.metadata ?? {}),
    ]
  );
  return result.rows[0];
}

export async function updateObservationStatus(
  id: string,
  status: string
): Promise<QuorumObservation | null> {
  const result = await pool.query<QuorumObservation>(
    `UPDATE quorum_observations
     SET status = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  return result.rows[0] ?? null;
}

export async function checkObservationExists(
  fingerprint: string
): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM quorum_observations WHERE fingerprint = $1 LIMIT 1',
    [fingerprint]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteObservation(id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM quorum_observations WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
