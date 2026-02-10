# The Quorum - Consolidation Report

**Date:** 2026-02-11

## Overview

This directory consolidates two GitHub repositories into a single, clean codebase:

1. **https://github.com/techman44/the-quorum** - The monorepo containing Python agents, dashboard, and supporting infrastructure
2. **https://github.com/techman44/the-quorum-dashboard** - A separate dashboard repository (essentially a copy of the monorepo)

## Source Analysis

### Repository 1: the-quorum (Monorepo)

**Structure:**
- `agents/` - Python-based conscience agents (Connector, Executor, Strategist, Devil's Advocate, Opportunist, Data Collector)
- `skills/` - Agent skill definitions
- `schema/` - PostgreSQL database schema migrations (7 migration files)
- `scripts/` - Installation and management scripts
- `integrations/` - Data source integration definitions
- `docs/` - Python-focused documentation
- `dashboard/` - Next.js dashboard application
- `standalone-dashboard/` - Another copy of the dashboard
- `docker-compose.yml` - Docker setup for PostgreSQL and Ollama
- `requirements.txt` - Python dependencies
- `.env.example` - Environment configuration template

### Repository 2: the-quorum-dashboard

This repository is essentially identical to the monorepo, containing the same directory structure. It appears to have been created as a separate release but contains no unique code beyond the monorepo.

### Local Working Copy: /Users/dean/the-quorum/dashboard

**Status:** Most up-to-date version of the dashboard

Contains the latest features including:
- Dynamic agent system with plug-and-play architecture
- OpenAI OAuth integration
- GOG (Google Workspace) integration
- Obsidian integration
- Skills management system
- Embedding provider management with model discovery
- Settings UI with provider management
- Agent discovery and dynamic assignment

## Consolidated Structure

```
/Users/dean/the-quorum-master/
├── README.md                    # Main README (from dashboard)
├── README-PYTHON.md             # Original Python agents README
├── CONSOLIDATION_REPORT.md      # This file
├── LICENSE                      # MIT License
├── .gitignore                   # From dashboard
├── .env.example                 # Environment template
├── docker-compose.yml           # Docker services (PostgreSQL + Ollama)
├── requirements.txt             # Python dependencies
├── dashboard/                   # Next.js Dashboard Application
│   ├── src/                     # Source code
│   │   ├── app/                 # Next.js app router
│   │   │   ├── api/             # API routes
│   │   │   │   ├── agents/      # Dynamic agent APIs
│   │   │   │   ├── auth/        # Authentication (OpenAI OAuth)
│   │   │   │   ├── gog/         # Google Workspace integration
│   │   │   │   ├── obsidian/    # Obsidian integration
│   │   │   │   ├── settings/    # Settings management
│   │   │   │   ├── skills/      # Skills management APIs
│   │   │   │   ├── tools/       # Tool discovery APIs
│   │   │   │   ├── webhooks/    # Webhook endpoints
│   │   │   │   └── workflows/   # Workflow endpoints
│   │   │   ├── agents/          # Agent detail pages
│   │   │   ├── chat/            # Chat interface
│   │   │   └── settings/        # Settings UI
│   │   ├── components/          # React components
│   │   │   ├── settings/        # Settings components (provider, embedding, GOG, Obsidian)
│   │   │   └── ui/              # UI components
│   │   └── lib/                 # Utilities
│   │       ├── ai/              # AI provider utilities
│   │       ├── oauth/           # OAuth implementations
│   │       ├── agent-discovery.ts
│   │       ├── agent-schema.ts
│   │       ├── agent-utils.ts
│   │       └── skills-schema.ts
│   ├── public/                  # Static assets
│   ├── migrations/              # Database migrations
│   ├── scripts/                 # Build/deploy scripts
│   ├── docs/                    # Dashboard documentation
│   ├── package.json
│   ├── next.config.ts
│   ├── docker-compose.yml       # Dashboard-specific compose
│   ├── Dockerfile
│   ├── deploy.sh
│   └── DEPLOYMENT.md
├── agents/                      # Python Conscience Agents
│   ├── base.py                  # Shared base class
│   ├── connector.py             # Memory Bridge agent
│   ├── executor.py              # Accountability agent
│   ├── strategist.py            # Pattern Recognition agent
│   ├── devils_advocate.py       # Critical Thinking agent
│   ├── opportunist.py           # Hidden Value agent
│   ├── data_collector.py        # Data ingestion agent
│   ├── onboarding.py            # First-run questionnaire
│   ├── runner.py                # Generic agent runner
│   └── prompts/                 # System prompts for agents
├── skills/                      # Agent Skill Definitions
│   ├── closer/
│   ├── connector/
│   ├── data-collector/
│   ├── devils-advocate/
│   ├── executor/
│   ├── onboarding/
│   ├── opportunist/
│   └── strategist/
├── schema/                      # PostgreSQL Schema
│   ├── 001_extensions.sql
│   ├── 002_documents.sql
│   ├── 003_conversations.sql
│   ├── 004_events.sql
│   ├── 005_tasks.sql
│   ├── 006_embeddings.sql
│   └── 007_agent_runs.sql
├── scripts-python/              # Python Management Scripts
│   ├── install.sh
│   ├── manage_integrations.sh
│   ├── migrate.sh
│   └── setup_cron.sh
├── integrations/                # Data Source Integrations
│   ├── integrations.yaml
│   └── loader.py
├── docs-python/                 # Python Documentation
│   ├── architecture.md
│   ├── deployment.md
│   └── integrations.md
└── logs/                        # Log files directory

```

## What Was Included

### From the Dashboard (Primary Source)
- Complete Next.js application with all latest features
- All API routes including new integrations (GOG, Obsidian, Skills)
- Settings UI components
- Database migrations
- Deployment configuration
- Documentation

### From the Monorepo (Python Components)
- All Python conscience agents
- Agent skill definitions
- Database schema files
- Installation and management scripts
- Integration definitions
- Python-focused documentation
- Docker compose for services

## What Was Excluded

### Build Artifacts (Removed)
- `node_modules/` - Can be regenerated with `npm install`
- `.next/` - Next.js build cache
- `tsconfig.tsbuildinfo` - TypeScript build cache
- `.env.local` - Contains local configuration, should not be in repo

### Redundant Directories
- The monorepo had two dashboard directories (`dashboard/` and `standalone-dashboard/`) which were identical. Only one is needed.
- The dashboard repo was essentially a copy of the monorepo with dashboard updates, so the non-dashboard Python components were added separately.

## Next Steps

To prepare this as a new GitHub repository:

1. **Initialize Git:**
   ```bash
   cd /Users/dean/the-quorum-master
   git init
   ```

2. **Create a Comprehensive README:**
   - Merge content from `README.md` and `README-PYTHON.md`
   - Document both the Python agents and Next.js dashboard
   - Include setup instructions for both components

3. **Add Git Remote and Push:**
   ```bash
   gh repo create the-quorum-master --public --source=. --push
   ```

4. **Install Dependencies:**
   ```bash
   # Dashboard
   cd dashboard
   npm install
   
   # Python agents (if needed)
   cd ..
   pip install -r requirements.txt
   ```

## Key Features

### Dashboard Features
- Dynamic agent discovery and plug-and-play architecture
- OpenAI OAuth for authentication
- Multiple AI provider support (OpenAI, Anthropic, Ollama, custom)
- Embedding provider management with model discovery
- GOG (Google Workspace) integration
- Obsidian vault integration
- Skills management system
- Webhook endpoints for n8n integration
- Settings UI for all configurations

### Python Agents Features
- Six conscience agents (Connector, Executor, Strategist, Devil's Advocate, Opportunist, Data Collector)
- Persistent memory via PostgreSQL with pgvector
- Semantic search over all data
- Cron-based scheduling
- Onboarding questionnaire
- Integration with external data sources

## Technical Stack

- **Frontend:** Next.js 15, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** PostgreSQL with pgvector extension
- **AI Providers:** OpenAI, Anthropic, Ollama, Custom
- **Python:** 3.x with asyncio
- **Containerization:** Docker and Docker Compose
