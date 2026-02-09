# The Quorum

### Your AI agents forget everything. These don't.

**The Quorum** is an open-source persistent memory and conscience layer for AI agents. It gives your LLM long-term memory, self-awareness, and accountability through a group of specialized "conscience agents" that observe, reflect, and act on your behalf.

One of our agents spotted a job listing, independently searched email history for contacts at that company, found a months-old conversation, and suggested a warm intro instead of a cold application. When the user didn't act, another agent called them out. Two agents, zero human prompting.

---

## The Five Conscience Agents

| Agent | Role | What It Does |
|-------|------|-------------|
| **The Connector** | Memory Bridge | Links current conversations to forgotten history. Surfaces relevant context before you have to ask. |
| **The Executor** | Accountability | Turns discussions into tracked tasks. Flags procrastination. Calls out broken commitments. |
| **The Strategist** | Pattern Recognition | Runs daily/weekly reflections. Identifies trends, risks, and opportunities across your data. |
| **The Devil's Advocate** | Critical Thinking | Challenges your assumptions. Stress-tests decisions. Surfaces risks you missed. |
| **The Opportunist** | Hidden Value | Spots quick wins, reusable patterns, and overlooked connections across projects. |

Plus a **Data Collector** that ingests external sources (email, documents, web pages) into the shared memory system.

### Onboarding

On first install, the system walks you through a conversational onboarding questionnaire powered by your configured LLM. It asks about your background (with optional LinkedIn/resume import for instant career context), your goals and priorities, how you want the agents to behave, notification preferences, and what data sources you'd want connected. Everything gets stored in the database so the agents have real data from day one.

```bash
# Run onboarding (automatically offered during install)
python -m agents.onboarding

# Re-run onboarding from scratch
python -m agents.onboarding --reset
```

---

## How It Works

```
    Your Conversations          External Data
    (chat, CLI, API)        (email, docs, files)
          |                        |
          v                        v
   +--------------+       +-----------------+
   |  Connector   |       | Data Collector  |
   +--------------+       +-----------------+
          |                        |
          +------+    +------------+
                 |    |
                 v    v
       +--------------------+
       |  PostgreSQL        |
       |  + pgvector        |
       |                    |
       |  - documents       |
       |  - conversations   |
       |  - embeddings      |
       |  - events          |
       |  - tasks           |
       +--------------------+
                 |
      +----------+----------+
      |          |          |
      v          v          v
 +----------+ +--------+ +-----------+
 | Executor | |Strategist| | Devil's  |
 +----------+ +--------+ | Advocate |
      |          |        +-----------+
      |          |             |
      +----------+-------------+
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

Every agent reads from and writes to the same shared memory. They run on independent schedules via cron, finding patterns and taking action without being prompted.

---

## Tech Stack

- **PostgreSQL + pgvector** -- semantic vector search over all your data
- **Python** -- agent scripts with a shared base class
- **Any LLM provider** -- Ollama (local), OpenAI, Anthropic, or anything with a chat API
- **Any embedding model** -- Ollama (mxbai-embed-large), OpenAI, or your own
- **Docker** -- handles PostgreSQL and Ollama automatically (no need to install them separately)

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/itcoreai/the-quorum.git
cd the-quorum

# Run the install script -- handles everything
chmod +x scripts/install.sh
./scripts/install.sh
```

The install script will:

1. Check prerequisites (Python 3, pip, Docker)
2. Start PostgreSQL + pgvector and Ollama via Docker Compose
3. Wait for both services to be ready
4. Pull the `mxbai-embed-large` embedding model and `llama3.2` LLM model
5. Create a Python virtual environment and install dependencies
6. Copy `.env.example` to `.env` with default configuration
7. Run database schema migrations
8. Offer to set up cron jobs for the conscience agents
9. Offer to run the **onboarding questionnaire** (seeds the database with your profile, goals, and preferences so the agents have context from day one)
10. Run a final health check

To manage Docker services after installation:

```bash
cd the-quorum
docker compose ps       # check service status
docker compose logs -f  # view logs
docker compose down     # stop services
docker compose up -d    # start services
```

---

## Configuration

All configuration lives in `.env`. See [`.env.example`](.env.example) for the full list of options.

Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `EMBEDDING_PROVIDER` | `ollama` or `openai` | `ollama` |
| `LLM_PROVIDER` | `ollama`, `openai`, or `anthropic` | `ollama` |
| `AGENT_TIMEZONE` | Your local timezone | `Australia/Sydney` |
| `AGENT_QUIET_HOURS_START` | Hour to stop notifications | `22` |
| `AGENT_QUIET_HOURS_END` | Hour to resume notifications | `8` |

---

## Scheduling

The agents run on independent cron schedules. Here is a recommended setup:

```cron
# Connector - summarize conversations, bridge to memory
*/10 * * * * cd /path/to/the-quorum && python agents/connector.py

# Executor - review tasks, flag stale items
0 * * * * cd /path/to/the-quorum && python agents/executor.py

# Strategist - daily reflection at 6am
0 6 * * * cd /path/to/the-quorum && python agents/strategist.py

# Devil's Advocate - challenge decisions every 4 hours
0 */4 * * * cd /path/to/the-quorum && python agents/devils_advocate.py

# Opportunist - scan for quick wins every 6 hours
0 */6 * * * cd /path/to/the-quorum && python agents/opportunist.py

# Data Collector - ingest files from data/inbox/ every 30 minutes
*/30 * * * * cd /path/to/the-quorum && python agents/data_collector.py
```

Adjust cadences to match your workflow. The agents respect quiet hours configured in `.env`.

---

## Example: Gmail to Inbox via n8n

You can use [n8n](https://n8n.io) to automatically feed emails into The Quorum without giving the system direct access to your Gmail account. The idea is simple: you label emails in Gmail, n8n watches for that label, and drops the content into `data/inbox/` where the Data Collector picks it up on its next run.

**Setup:**

1. **Create a Gmail label** called "Quorum" (or whatever name you prefer). Any email you tag with this label will be ingested into the memory system.

2. **Create an n8n workflow** with the following node structure:

```
Gmail Trigger (label: "Quorum")
  -> Extract body + attachments
  -> Write to File (path: data/inbox/)
```

   - **Gmail Trigger node**: Configure it to watch for new emails with the "Quorum" label. n8n handles the OAuth connection to Gmail entirely on its own.
   - **Process the email**: Extract the email body (plain text or HTML) and any attachments.
   - **Write the email body to file**: Save it as a `.txt` or `.eml` file in `data/inbox/` with a descriptive filename like `sender_subject_2026-02-09.txt`.
   - **Write attachments to file**: Save each attachment to `data/inbox/` using its original filename.

3. **The Data Collector cron job** (running every 30 minutes) picks up all new files from `data/inbox/`, categorizes them by file type, generates embeddings for semantic search, and moves them to `data/processed/`.

**Why this approach works well:**

- **Gmail credentials stay in n8n**, not in The Quorum. The Quorum never touches your email account.
- **You control exactly what enters the system** by choosing which emails to label. There is no background scanning of your inbox.
- **Security-conscious by design.** The separation means a compromise of The Quorum does not expose your Gmail credentials, and vice versa.

**This pattern works for any data source n8n supports.** The inbox directory is the universal entry point for external data. The same workflow structure applies to:

- **Slack messages** -- trigger on a specific channel or reaction, write message content to `data/inbox/`
- **Calendar events** -- trigger on new events, save event details as text files
- **RSS feeds** -- trigger on new items, save articles to `data/inbox/`
- **Webhooks** -- receive data from any service and write it to `data/inbox/`
- **Notion, Airtable, Google Sheets** -- trigger on changes, export rows or pages as files

Anything n8n can connect to becomes a data source for The Quorum, all flowing through the same `data/inbox/` directory that the Data Collector already monitors.

---

## Security and Privacy

- **All data stays local.** Your memories, conversations, and embeddings live in your own PostgreSQL instance. Nothing is sent to external services unless you explicitly configure a cloud LLM/embedding provider.
- **No external marketplace.** No third-party plugins, no dynamically loaded code. Every agent is defined in this repository.
- **No telemetry.** The Quorum does not phone home.
- **Sensitive data controls.** Tag records with metadata sensitivity levels. Use local models (Ollama) to keep everything on your machine.

---

## Project Structure

```
the-quorum/
  agents/              # Agent scripts
    base.py            # Shared base class (DB, LLM, embeddings, search)
    onboarding.py      # First-run questionnaire with LinkedIn/resume import
    connector.py       # The Connector agent
    executor.py        # The Executor agent
    strategist.py      # The Strategist agent
    devils_advocate.py # The Devil's Advocate agent
    opportunist.py     # The Opportunist agent
    data_collector.py  # The Data Collector agent
    runner.py          # Generic agent runner CLI
    prompts/           # System prompts for each agent
  schema/              # PostgreSQL schema migrations (7 files)
  scripts/             # Install, migrate, cron setup scripts
  integrations/        # Configurable data source definitions
  docs/                # Extended documentation
  docker-compose.yml   # PostgreSQL + Ollama containers
  .env.example         # Configuration template
  requirements.txt     # Python dependencies
```

---

## Contributing

Contributions are welcome. Here is how to get involved:

1. **Fork** the repository
2. **Create a branch** for your feature or fix
3. **Write tests** for new functionality
4. **Submit a pull request** with a clear description of the change

Please open an issue first for large changes so we can discuss the approach.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Built by [ITcore.ai](https://itcore.ai)
