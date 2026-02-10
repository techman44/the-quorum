# Architecture

A technical deep-dive into how The Quorum works, aimed at developers who want to understand the internals, extend the system, or build new agents.

---

## System Overview

The Quorum is a persistent memory and reasoning layer for AI agents. It stores everything -- conversations, documents, reflections, tasks -- in a single PostgreSQL database with pgvector for semantic search. A set of independent "conscience agents" run on cron schedules, reading from and writing to that shared memory to observe, reflect, and act.

```
    User Conversations            External Data
    (chat, CLI, API)          (email, docs, files)
          |                          |
          v                          v
   +--------------+         +-----------------+
   |  Connector   |         | Data Collector  |
   +--------------+         +-----------------+
          |                          |
          +--------+    +-----------+
                   |    |
                   v    v
        +---------------------+
        |  PostgreSQL          |
        |  + pgvector          |
        |                      |
        |  - documents         |
        |  - document_chunks   |
        |  - conversations     |
        |  - conversation_turns|
        |  - embeddings        |
        |  - events            |
        |  - tasks             |
        +---------------------+
                   |
        +----------+-----------+
        |          |           |
        v          v           v
   +----------+ +----------+ +-----------+
   | Executor | |Strategist| | Devil's   |
   +----------+ +----------+ | Advocate  |
        |          |          +-----------+
        |          |               |
        +----------+---------------+
                   |
                   v
           +-------------+
           | Opportunist |
           +-------------+
                   |
                   v
          Notifications / Actions
         (Telegram, email, tasks)
```

Data flows in two directions:

1. **Ingest** -- The Connector and Data Collector write new records into the database.
2. **Reason** -- The Executor, Strategist, Devil's Advocate, and Opportunist read from the database, run LLM-powered analysis, and write their outputs (reflections, tasks, flags) back into the same store.

Every agent is a standalone Python script. There is no message bus, no queue, and no inter-process communication. Coordination happens entirely through the shared database.

---

## Database Schema

The schema lives in `schema/` as numbered SQL files applied in order.

### Extensions (`001_extensions.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- UUID generation
```

### Documents (`002_documents.sql`)

The `documents` table is the primary unit of stored knowledge.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `doc_type` | TEXT | One of: `note`, `summary`, `reflection`, `email`, `file`, `web`, `record` |
| `source` | TEXT | Which agent or system created this record |
| `title` | TEXT | Human-readable title |
| `content` | TEXT | The full text content |
| `metadata` | JSONB | Arbitrary structured metadata |
| `tags` | TEXT[] | Freeform tags for filtering |
| `owner_id` | TEXT | Optional ownership (user, project, team) |
| `created_at` | TIMESTAMPTZ | Row creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on modification via trigger |

Indexes cover `doc_type`, `source`, `tags` (GIN), `owner_id`, and `created_at`.

The `document_chunks` table subdivides long documents for finer-grained embedding:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK to `documents`, cascading delete |
| `chunk_index` | INT | Position within the parent document |
| `content` | TEXT | The chunk text |
| `metadata` | JSONB | Chunk-level metadata |

### Conversations (`003_conversations.sql`)

The `conversations` table tracks multi-turn interactions.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `title` | TEXT | Conversation title |
| `source` | TEXT | Originating system or agent |
| `participant_ids` | TEXT[] | Who was involved |
| `metadata` | JSONB | Arbitrary metadata |
| `created_at` / `updated_at` | TIMESTAMPTZ | Timestamps with auto-update trigger |

The `conversation_turns` table stores individual messages:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK to `conversations`, cascading delete |
| `turn_index` | INT | Order within the conversation |
| `role` | TEXT | One of: `user`, `assistant`, `system`, `tool` |
| `content` | TEXT | The message text |

---

## Embedding Strategy

### Why pgvector and HNSW

The Quorum uses PostgreSQL's pgvector extension rather than a dedicated vector database for several reasons:

- **Single data store.** Keeping vectors alongside relational data eliminates sync issues. An agent can join a vector similarity search with a SQL filter in a single query.
- **HNSW indexes.** pgvector supports Hierarchical Navigable Small World (HNSW) indexes, which offer excellent recall at low latency for the dataset sizes typical of a personal memory system (tens to hundreds of thousands of records).
- **Operational simplicity.** One database to back up, monitor, and secure.

### Why 1024 dimensions

The default embedding model (`mxbai-embed-large` via Ollama) produces 1024-dimensional vectors. This dimension count offers a strong balance between representational quality and storage/compute cost:

- 1024 dims captures enough semantic nuance for document-level and chunk-level similarity.
- The HNSW index on 1024-dim vectors fits comfortably in memory for datasets up to several hundred thousand records.
- Switching to a different model (such as OpenAI's `text-embedding-3-small` at 1536 dims) requires altering the vector columns and rebuilding the index.

### Chunking strategy

Long documents are split into chunks before embedding. Each chunk is stored in `document_chunks` with a `chunk_index` so the original order can be reconstructed.

The chunking approach:

1. **Split on paragraphs** -- double newlines are the primary boundary.
2. **Target size: ~500 tokens per chunk** -- small enough for precise retrieval, large enough to retain context.
3. **Overlap: ~50 tokens** -- adjacent chunks share a small overlap to avoid losing information at boundaries.
4. **Metadata inheritance** -- each chunk inherits the parent document's `doc_type`, `source`, and `tags` in its own metadata field so it can be filtered independently.

Retrieval uses a two-stage approach: the vector search finds the most similar chunks, then the application fetches the parent document for full context when needed.

---

## Agent Interaction Patterns

All agents follow the same basic loop:

```
1. Query the database for relevant data (SQL + vector search)
2. Build a prompt with the retrieved context
3. Send the prompt to the configured LLM
4. Parse the LLM response
5. Write results back to the database (new documents, tasks, flags)
6. Optionally send notifications
```

### How agents read memory

Agents use a combination of:

- **Recency queries** -- `SELECT ... ORDER BY created_at DESC LIMIT n` to get the latest activity.
- **Semantic search** -- cosine similarity against embedding vectors to find conceptually related records regardless of time.
- **Tag/type filters** -- narrowing results by `doc_type`, `source`, or `tags` to focus on specific categories.
- **Metadata queries** -- JSONB operators to filter on structured fields (e.g., priority, status, project).

### How agents write memory

Agents write back into the same tables they read from:

- **The Connector** writes `summary` documents that bridge conversations to existing knowledge.
- **The Executor** writes `record` documents tracking tasks, deadlines, and accountability flags.
- **The Strategist** writes `reflection` documents containing daily/weekly analysis.
- **The Devil's Advocate** writes `note` documents with counterarguments and risk assessments.
- **The Opportunist** writes `note` documents highlighting patterns and quick wins.
- **The Data Collector** writes `email`, `file`, `web`, or `record` documents depending on the source.

Every agent stamps its `source` field so you can always trace who wrote what.

### No inter-agent communication

Agents do not talk to each other directly. They communicate implicitly through the database:

- The Strategist's daily reflection might surface a pattern that the Executor later turns into a task.
- The Devil's Advocate reads the Strategist's reflection and writes a counterpoint.
- The Opportunist reads everything and connects dots across agents.

This design is intentional. It keeps each agent simple, testable, and independently deployable. The database is the single source of truth.

---

## Scheduling Philosophy

Agent schedules are not arbitrary. They reflect the nature of each agent's work.

### Observation tier (high frequency)

| Agent | Frequency | Rationale |
|-------|-----------|-----------|
| Connector | Every 10 min | New conversations happen continuously. Bridging to memory should be near-realtime. |
| Data Collector | Every 30 min | External sources (email, documents) update frequently but not constantly. |

These agents are **observers**. They ingest and index data but do not make judgments.

### Action tier (medium frequency)

| Agent | Frequency | Rationale |
|-------|-----------|-----------|
| Executor | Every hour | Task tracking needs to be responsive but not frantic. Hourly checks catch stale items without over-notifying. |
| Devil's Advocate | Every 4 hours | Critical analysis benefits from accumulated context. Running every 4 hours gives it enough new material to work with. |

These agents **act** on the data -- creating tasks, flagging risks, challenging decisions.

### Reflection tier (low frequency)

| Agent | Frequency | Rationale |
|-------|-----------|-----------|
| Strategist | Daily at 3 AM | Deep pattern recognition works best with a full day of data. Running overnight means results are ready in the morning. |
| Opportunist | Every 6 hours | Looking for hidden value requires scanning broadly. Too-frequent runs waste LLM calls on unchanged data. |

These agents **reflect**. They look across longer time horizons and produce higher-level insights.

### Quiet hours

All agents respect the `AGENT_QUIET_HOURS_START` and `AGENT_QUIET_HOURS_END` settings in `.env`. During quiet hours, agents still run and write to the database, but they suppress notifications (Telegram, email). This prevents overnight noise while ensuring no data is lost.

---

## The Tiered Approach

The Quorum's agents form a layered system, each tier building on the output of the tier below it.

### Tier 1: Observation

**Agents:** Connector, Data Collector

These agents watch. They ingest raw data from conversations and external sources, summarize it, generate embeddings, and store it in the database. They do not make judgments or recommendations.

The output of Tier 1 is a structured, searchable corpus of everything the user has said, read, or received.

### Tier 2: Analysis

**Agents:** Executor, Devil's Advocate

These agents examine the Tier 1 data and extract actionable information:

- The **Executor** identifies commitments, deadlines, and procrastination patterns. It turns vague intentions into tracked tasks.
- The **Devil's Advocate** challenges recent decisions and flags risks. It reads what you said you would do and asks whether that is actually a good idea.

The output of Tier 2 is a set of tasks, warnings, and critical questions.

### Tier 3: Synthesis

**Agents:** Strategist, Opportunist

These agents operate on the combined output of Tiers 1 and 2:

- The **Strategist** performs periodic deep reflections, identifying long-term trends, recurring problems, and strategic opportunities across the full history.
- The **Opportunist** looks for hidden connections, reusable patterns, and quick wins that span multiple projects or contexts.

The output of Tier 3 is high-level insight that no single agent could produce alone.

### Why tiers matter

Each tier adds latency but also adds depth:

- Tier 1 runs every 10-30 minutes and answers "what happened?"
- Tier 2 runs every 1-4 hours and answers "what should we do about it?"
- Tier 3 runs every 6-24 hours and answers "what does it all mean?"

This mirrors how human cognition works: fast perception, slower deliberation, slowest reflection.

---

## Security Model

### Data locality

All data stays in your PostgreSQL instance. No data is sent to external services unless you explicitly configure a cloud LLM or embedding provider. Using Ollama for both LLM and embeddings keeps everything entirely on your machine.

### Credential management

All secrets (database passwords, API keys, tokens) are stored in `.env` and loaded at runtime via `python-dotenv`. The `.env` file is excluded from version control via `.gitignore`.

No credentials are hardcoded in the source. The `.env.example` file contains only placeholder values.

### No dynamic code execution

Every agent is a Python script defined in this repository. There is no plugin system, no dynamic code loading, no eval of user-provided strings. The agents read data from the database and send it to an LLM as a prompt -- they do not execute LLM output as code.

### No telemetry

The Quorum does not phone home, collect usage metrics, or send analytics to any external service.

### Network exposure

The default deployment exposes only the PostgreSQL port (5432) for local connections. The agents connect to the database via localhost. If you deploy PostgreSQL on a remote server, secure the connection with TLS and restrict access by IP.

The LLM and embedding providers are the only external network connections, and only when you choose a cloud provider.

### Metadata sensitivity

Documents support a `metadata` JSONB field where you can tag records with sensitivity levels. Agents can be configured to filter on these tags, ensuring that highly sensitive data is only processed by specific agents or excluded from certain operations.
