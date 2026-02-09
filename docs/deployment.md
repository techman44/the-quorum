# Deployment Guide

This guide covers everything needed to get The Quorum running, from a quick automated install to a fully manual bare-metal deployment.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Python | 3.10+ | 3.12 recommended |
| PostgreSQL | 15+ | Must have the **pgvector** extension |
| pip | latest | Usually bundled with Python |
| Docker (optional) | 20+ | Only needed if you want the managed DB container |

If you plan to use **Ollama** for local LLM and embeddings you will also need it installed and running before the agents can do anything useful. Cloud providers (OpenAI, Anthropic) only require an API key.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/itcoreai/the-quorum.git
cd the-quorum

# 2. Run the install script
chmod +x scripts/install.sh
./scripts/install.sh
```

The install script will:

1. Check that Python, pip, and either psql or Docker are available.
2. Ask whether to start PostgreSQL via Docker or connect to an existing instance.
3. Create a `.env` file (from `.env.example`) if one does not exist.
4. Create a Python virtual environment at `.venv/`.
5. Install Python dependencies from `requirements.txt`.
6. Run schema migrations against the database.
7. Optionally install cron jobs for all agents.

After the script finishes, edit `.env` to configure your LLM and embedding providers, then test an agent:

```bash
.venv/bin/python -m agents.connector
```

---

## Manual Setup

If you prefer to set things up yourself, follow these steps.

### 1. Clone and configure

```bash
git clone https://github.com/itcoreai/the-quorum.git
cd the-quorum
cp .env.example .env
```

Open `.env` in your editor and fill in the database connection details and provider keys.

### 2. Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Database

You need a PostgreSQL instance with the **pgvector** extension installed.

#### Option A -- Docker (recommended)

```bash
docker compose up -d
```

This starts a `pgvector/pgvector:pg17` container with credentials read from `.env`. The schema files in `schema/` are automatically applied on first start because they are mounted into `/docker-entrypoint-initdb.d`.

#### Option B -- Existing PostgreSQL

Make sure pgvector is installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the migrations:

```bash
chmod +x scripts/migrate.sh
./scripts/migrate.sh
```

### 4. Cron jobs

```bash
chmod +x scripts/setup_cron.sh
./scripts/setup_cron.sh
```

This adds cron entries for every agent. Use `--remove` to clean them up later.

### 5. Logs directory

```bash
mkdir -p logs
```

Agent output is appended to files in `logs/`.

---

## Docker Deployment

The included `docker-compose.yml` runs only the database. The agents themselves run as Python scripts on the host (via cron or another scheduler). This keeps the architecture simple and easy to inspect.

```yaml
# docker-compose.yml (summary)
services:
  postgres:
    image: pgvector/pgvector:pg17
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - quorum_data:/var/lib/postgresql/data
      - ./schema:/docker-entrypoint-initdb.d
```

To reset the database entirely:

```bash
docker compose down -v   # removes the named volume
docker compose up -d     # recreates from scratch
```

---

## Bare Metal Deployment

On a server without Docker:

1. Install PostgreSQL 15+ and the pgvector extension from your package manager.
   - Ubuntu/Debian: `sudo apt install postgresql-15-pgvector`
   - macOS (Homebrew): `brew install pgvector`
2. Create the database and user:
   ```sql
   CREATE USER quorum WITH PASSWORD 'your-password';
   CREATE DATABASE quorum OWNER quorum;
   \c quorum
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
3. Update `.env` with the connection details.
4. Run `scripts/migrate.sh` to apply the schema.
5. Set up cron with `scripts/setup_cron.sh` or add the entries manually.

---

## Configuring LLM Providers

The Quorum supports multiple LLM backends. Set `LLM_PROVIDER` in `.env`.

### Ollama (local, no API key needed)

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
OLLAMA_HOST=http://localhost:11434
```

Make sure the model is pulled:

```bash
ollama pull llama3.2
```

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o
```

### Anthropic

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-sonnet-4-5-20250929
```

---

## Configuring Embedding Providers

Embeddings are used for semantic search across all documents and conversations. Set `EMBEDDING_PROVIDER` in `.env`.

### Ollama (local)

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_EMBED_MODEL=mxbai-embed-large
```

Pull the model first:

```bash
ollama pull mxbai-embed-large
```

`mxbai-embed-large` produces 1024-dimensional vectors, which matches the schema's vector column sizes and HNSW index configuration.

### OpenAI

```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

If you switch embedding providers after data has been ingested you will need to re-embed all existing records so the vector space is consistent.

---

## Setting Up Cron Schedules

The default schedule installed by `scripts/setup_cron.sh`:

| Agent | Schedule | Rationale |
|-------|----------|-----------|
| Connector | Every 10 minutes | Bridges recent conversations to long-term memory quickly |
| Executor | Every hour | Reviews tasks and flags stale commitments |
| Strategist | Daily at 3:00 AM | Deep reflection works best on a full day of data |
| Devil's Advocate | Every 4 hours | Frequent enough to catch bad decisions early |
| Opportunist | Every 6 hours | Scans for patterns; less urgency than the others |
| Data Collector | Every 30 minutes | Keeps external data sources reasonably fresh |

Adjust cadences by editing `scripts/setup_cron.sh` or managing cron entries directly with `crontab -e`.

All agents respect the quiet hours defined in `.env` (`AGENT_QUIET_HOURS_START` / `AGENT_QUIET_HOURS_END`). During quiet hours notifications are suppressed but agents still run and write to memory.

---

## Connecting to OpenClaw

If you are running [OpenClaw](https://github.com/itcoreai/openclaw), you can use its built-in cron/scheduling system as an alternative to system cron. This is useful when you want a single dashboard for all scheduled tasks.

To configure this:

1. In OpenClaw, create a new scheduled task for each agent.
2. Point each task at the agent's entry point:
   ```
   cd /path/to/the-quorum && .venv/bin/python -m agents.connector
   ```
3. Set the schedule using OpenClaw's cron syntax (identical to standard cron).
4. OpenClaw will manage execution, logging, and retry logic.

You can use system cron and OpenClaw side by side, but avoid running the same agent from both schedulers simultaneously.

---

## Monitoring and Logs

### Log files

Each agent appends output to its own log file in `logs/`:

```
logs/connector.log
logs/executor.log
logs/strategist.log
logs/devils_advocate.log
logs/opportunist.log
logs/data_collector.log
```

Tail a log in real time:

```bash
tail -f logs/connector.log
```

### Log rotation

The log files grow indefinitely by default. Set up `logrotate` on Linux or `newsyslog` on macOS to manage them:

```
# /etc/logrotate.d/the-quorum (Linux example)
/path/to/the-quorum/logs/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

### Database health

Check that the agents are writing data:

```sql
-- Recent documents
SELECT id, doc_type, source, created_at
FROM documents ORDER BY created_at DESC LIMIT 10;

-- Recent conversations
SELECT id, title, source, created_at
FROM conversations ORDER BY created_at DESC LIMIT 10;
```

---

## Troubleshooting

### `psql: connection refused`

- Is PostgreSQL running? Check with `docker ps` or `systemctl status postgresql`.
- Are the host and port in `.env` correct?
- If using Docker, wait a few seconds after `docker compose up -d` for the database to initialize.

### `ERROR: extension "vector" does not exist`

- Your PostgreSQL instance does not have pgvector installed.
- Use the Docker image (`pgvector/pgvector:pg17`) or install pgvector from source / your package manager.

### `ModuleNotFoundError: No module named 'agents'`

- Make sure you are running agents from the project root directory:
  ```bash
  cd /path/to/the-quorum
  .venv/bin/python -m agents.connector
  ```
- The `-m` flag requires the working directory to contain the `agents/` package.

### `psycopg2` build errors

- `psycopg2-binary` should install without needing PostgreSQL dev headers.
- If it still fails, install `libpq-dev` (Debian/Ubuntu) or `postgresql` (Homebrew) and try again.

### Agents produce no output

- Check that your LLM provider is configured and reachable.
- For Ollama: is the service running (`ollama serve`)? Is the model pulled?
- For cloud providers: is the API key valid?
- Check the agent log file for error messages.

### Cron jobs not firing

- Verify the entries exist: `crontab -l`
- Make sure the `.venv` path in the cron entry is absolute and correct.
- Check `/var/log/syslog` (Linux) or `/var/log/system.log` (macOS) for cron errors.
- On macOS, cron needs Full Disk Access in System Settings > Privacy & Security.

### Embedding dimension mismatch

- The schema uses 1024-dimensional vectors (matching `mxbai-embed-large`).
- If you switch to a model with different dimensions, you will need to alter the vector columns and re-embed all data.

### Docker port conflict

- If port 5432 is already in use, change `DB_PORT` in `.env` to an available port before running `docker compose up -d`. The docker-compose file reads `DB_PORT` for the host-side mapping.
