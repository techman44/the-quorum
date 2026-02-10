# Standalone Quorum Product: Strategy Research Document

**Status:** Exploratory
**Date:** February 2026
**Purpose:** Evaluate feasibility of packaging The Quorum as a standalone product without OpenClaw dependency

---

## Executive Summary

A standalone Quorum product is **technically viable and potentially lucrative**. The key advantage: replacing OpenClaw with n8n as the integration layer provides 400+ pre-built connectors, dramatically reducing development complexity while maintaining the sophisticated multi-agent orchestration that makes The Quorum unique.

**MVP Path:** Docker Compose deployment with Ollama (CPU mode), n8n integration layer, PostgreSQL with RLS for multi-tenancy, and a simplified 3-agent subset for initial validation.

**Primary Risk:** Market differentiation. The standalone product needs to clearly articulate why 6 specialized agents with debate/deliberation is better than single-agent systems or generic multi-agent frameworks.

---

## A. Architecture Options: Post-OpenClaw Design

### Current OpenClaw Dependencies to Replace

1. **Plugin System** (Gmail, databases, search, etc.)
2. **LLM Orchestration** (model access and routing)
3. **State Management** (conversation memory, context)
4. **Authentication/Credentials** (for third-party services)

### Replacement Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│              (Next.js Dashboard - Port 3000)             │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│               Quorum Agent Orchestrator                  │
│   (Python/FastAPI - Manages 6 agent lifecycle/debate)   │
│   - Connector      - Devil's Advocate                    │
│   - Executor       - Opportunist                         │
│   - Strategist     - Data Collector                      │
└─────┬──────────────────────────┬────────────────────────┘
      │                          │
      │                          │ Embeddings
      │                          │
      ▼                          ▼
┌─────────────────┐    ┌─────────────────────┐
│   n8n Server    │    │ PostgreSQL + pgvector│
│  (Port 5678)    │    │    (Port 5432)       │
│                 │    │                      │
│ 400+ Connectors:│    │ - Agent memory       │
│ - Gmail/Outlook │    │ - Conversation state │
│ - Slack/Teams   │    │ - Customer data (RLS)│
│ - CRMs          │    │ - Vector embeddings  │
│ - Databases     │    │ - Multi-tenant       │
│ - APIs          │    │   isolation          │
└────────┬────────┘    └──────────────────────┘
         │
         │ Webhooks/HTTP
         │
         ▼
┌─────────────────────┐
│  Ollama / vLLM      │
│    (Port 11434)     │
│                     │
│ Models:             │
│ - Llama 3.3 70B     │
│ - Qwen 2.5 32B      │
│ - DeepSeek R1       │
└─────────────────────┘
```

### Option 1: n8n as Integration Middleware (RECOMMENDED)

**How it works:**
- n8n becomes the "hands" of The Quorum agents
- Agents send structured requests to n8n workflows via webhooks
- n8n executes actions (send email, query CRM, update spreadsheet, etc.)
- Results flow back to agents for analysis and next steps

**Example Flow:**
```
User: "Summarize unread emails and identify urgent items"
  ↓
Connector Agent → n8n workflow "fetch-gmail"
  ↓
Gmail API (via n8n OAuth) → Returns 15 unread messages
  ↓
Data Collector Agent → Categorizes by urgency
  ↓
Strategist Agent → Proposes response strategy
  ↓
Executor Agent → n8n workflow "send-email-response"
```

**Advantages:**
- 400+ pre-built integrations maintained by n8n community
- Visual workflow builder for customers to customize integrations
- Built-in OAuth credential management
- Self-hosted or cloud options
- Eliminates need to build/maintain individual API connectors
- Customer can extend integrations without code changes

**Disadvantages:**
- Additional service to run and manage
- Learning curve for workflow design (though visual UI helps)
- Extra network hop adds ~50-100ms latency per integration call

### Option 2: Direct API Integrations

**How it works:**
- Build custom Python modules for each integration (Gmail, Slack, CRMs, etc.)
- Agents directly call these modules via function calling
- Credentials managed in environment variables or secrets manager

**Advantages:**
- Lower latency (no middleware hop)
- Full control over integration logic
- Simpler deployment (one less service)

**Disadvantages:**
- **Significant development overhead**: Each integration requires custom OAuth flow, error handling, rate limiting, retries
- **Maintenance burden**: API changes require code updates
- **Limited customer extensibility**: Adding new integrations requires engineering work
- **Security complexity**: Managing credentials for 50+ services is error-prone

**Verdict:** n8n wins for a product. Development speed and customer flexibility outweigh the latency tradeoff.

---

## B. Tech Stack Recommendation

### Core Infrastructure

**Deployment Package:**
- **Docker Compose** for MVP (single-server deployment, <1000 users)
- **Kubernetes** for scale (multi-tenant SaaS with 10k+ users)

**Services:**
```yaml
services:
  # Frontend & API
  quorum-dashboard:
    image: quorum/dashboard:latest
    ports: ["3000:3000"]

  # Agent Orchestrator
  quorum-agents:
    image: quorum/agents:latest
    ports: ["8000:8000"]
    environment:
      - LLM_PROVIDER=ollama
      - N8N_WEBHOOK_URL=http://n8n:5678/webhook

  # Integration Layer
  n8n:
    image: n8nio/n8n:latest
    ports: ["5678:5678"]
    volumes:
      - n8n_data:/home/node/.n8n

  # Database
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: quorum_production

  # LLM Inference
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama_models:/root/.ollama
```

### LLM Strategy

**Development/CPU-Only Customers:**
- **Ollama** with quantized models (Q4_K_M)
  - Llama 3.3 70B quantized → ~40GB RAM, 8-core CPU
  - Qwen 2.5 32B quantized → ~20GB RAM, 4-core CPU
  - DeepSeek R1 14B → ~8GB RAM, reasonable on consumer hardware

**Production/GPU Customers:**
- **vLLM** for high-throughput serving
  - 2-4x better throughput than Ollama for concurrent users
  - PagedAttention reduces memory by 50%
  - Better for multi-tenant scenarios with 10+ concurrent sessions

**Tiered Approach:**
```
Tier 1 (Small Business): Ollama + Llama 3.3 8B (4GB RAM)
Tier 2 (SMB):            Ollama + Qwen 2.5 32B (20GB RAM)
Tier 3 (Enterprise):     vLLM + Llama 3.3 70B on GPU (A100 40GB)
```

### Database: Multi-Tenancy with PostgreSQL

Use **Row-Level Security (RLS)** for tenant isolation:

```sql
-- Example RLS policy
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Each customer query sets tenant context
SET app.current_tenant = 'customer-uuid-here';
SELECT * FROM conversations; -- Only sees their data
```

**Why RLS over schema-per-tenant:**
- Simpler operations (one schema, not 100+ schemas)
- Easier backups and migrations
- Good enough isolation for most B2B SaaS
- Use separate databases only for enterprise customers with strict compliance needs

---

## C. n8n as Integration Layer: Deep Dive

### Architectural Pattern

**1. Agent-to-n8n Communication**

Agents send structured JSON to n8n webhook endpoints:

```javascript
// Agent sends request
POST http://n8n:5678/webhook/quorum-gmail-fetch
{
  "tenant_id": "customer-abc",
  "agent_id": "connector-001",
  "action": "fetch_unread",
  "params": {
    "max_results": 20,
    "labels": ["INBOX"]
  }
}
```

**2. n8n Workflow Processing**

```
[Webhook Trigger]
    ↓
[Validate Tenant] (Check credentials vault)
    ↓
[Gmail Node] (Fetch emails using customer's OAuth token)
    ↓
[Transform Data] (Convert to agent-friendly format)
    ↓
[Respond to Webhook] (Return JSON to agent)
```

**3. Agent Processes Results**

```python
# Agent receives response
{
  "status": "success",
  "emails": [
    {
      "id": "msg-123",
      "from": "client@example.com",
      "subject": "Urgent: Q1 Report Due Tomorrow",
      "snippet": "We need the revenue analysis...",
      "urgency_score": 8.5  # n8n can run sentiment analysis too
    }
  ],
  "metadata": {
    "total_unread": 47,
    "processing_time_ms": 340
  }
}
```

### n8n Workflow Catalog for Quorum

**Essential Workflows to Build:**

1. **Email Management** (Gmail, Outlook)
   - Fetch unread/filtered messages
   - Send emails (with templates)
   - Archive/label/delete operations

2. **Communication** (Slack, Teams, Discord)
   - Post messages to channels
   - Fetch recent conversations
   - Set status/presence

3. **CRM Integration** (Salesforce, HubSpot, Pipedrive)
   - Query contacts/deals
   - Update records
   - Create tasks/notes

4. **Data Sources** (Google Sheets, Airtable, Notion)
   - Query data
   - Update rows/records
   - Trigger on changes

5. **Web Scraping & APIs**
   - HTTP requests to custom APIs
   - Parse HTML content
   - Monitor websites for changes

### Customer Customization Story

**Key Advantage:** Customers can extend The Quorum without code:

1. Customer logs into n8n (included in Quorum package)
2. Browses 400+ available integrations
3. Creates new workflow using visual builder
4. Exposes workflow as webhook endpoint
5. Configures Quorum agent to call that endpoint

Example: "Connect Quorum to my proprietary ERP system"
- Customer creates n8n workflow with HTTP request node
- Adds authentication headers for their ERP
- Maps data fields between Quorum and ERP
- Done. No Python code required.

### Performance Considerations

- **Latency:** ~50-100ms overhead per n8n call (acceptable for non-real-time tasks)
- **Throughput:** n8n handles 220 executions/second on single instance
- **Scaling:** Can run multiple n8n instances behind load balancer
- **Cost:** Self-hosted n8n has no per-execution fees (unlike Zapier/Make)

---

## D. Product Considerations

### Multi-Tenancy Design

**Tenant Isolation Layers:**

1. **Database:** PostgreSQL RLS policies per tenant_id
2. **Agent Memory:** Each tenant gets isolated conversation contexts
3. **Credentials:** n8n credentials vault segregated by tenant
4. **LLM Context:** Prompt injection prevention, tenant-specific system prompts

**Deployment Options:**

- **Shared Infrastructure:** All tenants on same hardware (Docker Compose)
  - Good for: 10-100 small business customers
  - Cost: ~$200-500/month for beefy VPS

- **Isolated VMs:** Each customer gets own Docker Compose stack
  - Good for: Enterprise customers, high compliance needs
  - Cost: ~$100-300/month per customer (pass-through pricing)

- **Kubernetes Multi-Tenant:** One cluster, namespaced tenants
  - Good for: 100+ customers, SaaS at scale
  - Cost: ~$1000/month base + $5-10/customer incremental

### Differentiation vs. Competitors

**What makes Standalone Quorum unique:**

1. **6-Agent Debate Model:**
   - Not just one AI answering questions
   - Devil's Advocate challenges assumptions
   - Opportunist finds creative angles
   - Strategist ensures long-term thinking
   - **Pitch:** "Better decisions through AI deliberation"

2. **Built-in Integration Layer:**
   - Not just a chatbot - it takes actions
   - 400+ connectors out of the box via n8n
   - Customers can extend without vendor lock-in

3. **Self-Hosted Option:**
   - Data never leaves customer infrastructure
   - Use their own LLMs (no OpenAI fees)
   - Compliance-friendly (HIPAA, SOC2, GDPR)

4. **Transparent Decision Making:**
   - Dashboard shows full agent debate transcripts
   - Customers see why agents reached conclusions
   - Auditable for regulated industries

**Competitive Landscape:**

- **vs. Single-Agent Tools (ChatGPT, Claude):** Multi-perspective deliberation catches errors, reduces hallucination
- **vs. Generic Multi-Agent Frameworks (CrewAI, AutoGPT):** Pre-configured for business workflows, not just code execution
- **vs. RPA Tools (Zapier, Make):** Intelligent decision-making, not just if-then automation
- **vs. Enterprise AI Platforms (Salesforce Einstein):** Vendor-agnostic, works with any stack, self-hostable

### Pricing Model Ideas

**Option 1: Per-Agent-Hour Pricing**
- $0.10 per agent-hour of computation
- Customer pays for what they use
- Aligns cost with value (more complex tasks = more agent time)

**Option 2: Tiered Subscription**
```
Starter: $299/month
  - 3 agents (Connector, Executor, Strategist)
  - 1000 agent calls/month
  - Community support

Professional: $999/month
  - All 6 agents
  - 10,000 agent calls/month
  - 50 n8n workflows
  - Email support

Enterprise: Custom
  - Unlimited agents/calls
  - Dedicated infrastructure
  - SLA, phone support
  - Custom integrations
```

**Option 3: Self-Hosted License**
- $5,000/year per organization
- Unlimited usage on their infrastructure
- Updates and support included
- Appeals to enterprises with strict data policies

### Go-to-Market Considerations

**Target Customer Profiles:**

1. **Operations Teams** (non-technical)
   - Pain: Drowning in emails, Slack messages, CRM updates
   - Pitch: "Your AI operations team handles routine work 24/7"

2. **Small Business Owners**
   - Pain: Can't afford full-time staff for admin tasks
   - Pitch: "Six AI assistants for the price of one intern"

3. **Compliance-Heavy Industries** (Healthcare, Finance)
   - Pain: Can't use cloud AI due to data restrictions
   - Pitch: "AI that runs on your servers, never sends data outside"

4. **Consultants/Agencies**
   - Pain: Context-switching between client systems
   - Pitch: "One AI team that works across all your client tools"

---

## E. Quick Assessment: Is This Worth Pursuing?

### Strengths

1. **Technical Feasibility:** High. Stack is proven (Next.js, Python, PostgreSQL, n8n, Ollama/vLLM)
2. **Differentiation:** Strong. Multi-agent deliberation model is unique and defensible
3. **Market Timing:** Good. 2026 is peak "AI for business operations" interest
4. **Development Efficiency:** n8n dramatically reduces integration work (6-12 months saved vs. building connectors)
5. **Customer Lock-in:** Low (good for trust) - they can self-host and own their data

### Weaknesses

1. **Complex Deployment:** Running 5+ services (dashboard, agents, n8n, postgres, ollama) is intimidating for non-technical customers
2. **Hardware Requirements:** 70B models need serious RAM/GPU, limiting addressable market
3. **Support Burden:** Customers will need help configuring n8n workflows, OAuth, etc.
4. **LLM Cost Uncertainty:** If customers can't self-host, cloud LLM costs could eat margins
5. **Competition:** Crowded space with well-funded players (OpenAI, Anthropic, enterprise AI vendors)

### MVP Recommendation

**Phase 1: Proof of Value (4-6 weeks)**

Build the absolute minimum to validate with 5 beta customers:

1. **3 Agents Only:** Connector, Executor, Strategist (drop Devil's Advocate, Opportunist, Data Collector for now)
2. **5 Integrations:** Gmail, Slack, Google Sheets, generic HTTP, webhook triggers
3. **Docker Compose Deployment:** Single-server setup, no Kubernetes complexity
4. **Ollama + Llama 3.3 8B:** Small model for fast iteration, CPU-only
5. **Basic Dashboard:** View agent conversations, trigger actions manually
6. **No Multi-Tenancy:** Each beta customer gets their own deployment

**Success Criteria:**
- 3 out of 5 beta customers say "I'd pay for this"
- Agents successfully complete 80% of test workflows without human intervention
- Average task completion time < 2 minutes (vs. 10+ minutes manual)

**Phase 2: Product Polish (8-12 weeks)**

If MVP validates:

1. Add remaining 3 agents (full 6-agent experience)
2. Build 20+ pre-configured n8n workflows for common use cases
3. Implement multi-tenancy with RLS
4. Create customer onboarding wizard
5. Add vLLM support for GPU customers
6. Build usage analytics and billing system

### Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Agents make critical errors | High | High | Require human approval for destructive actions (delete, send money, etc.) |
| Customers can't configure n8n | Medium | High | Pre-built workflow templates + video tutorials + onboarding calls |
| LLM hallucinations cause damage | Medium | High | Confidence scoring, agent debate creates checks/balances, audit logs |
| Market too crowded to gain traction | Medium | Medium | Focus on self-hosted niche, compliance-heavy industries first |
| Hardware requirements too steep | High | Medium | Start with cloud-hosted option (we run infrastructure), self-host for enterprise only |

### Final Verdict

**This is worth a focused 6-week MVP sprint.**

The combination of multi-agent deliberation + n8n integration layer + self-hosting option creates a defensible niche. The core Quorum system already exists, so you're not starting from zero.

**Key Questions to Answer in MVP:**

1. Do customers actually trust AI agents to take actions (send emails, update CRMs)?
2. Is the 6-agent debate model noticeably better than single-agent, or is it complexity for complexity's sake?
3. Can non-technical users configure n8n workflows, or does that require too much handholding?
4. What's the minimum viable hardware? (Can we get away with 8B models, or do customers demand 70B quality?)

If those questions have positive answers after MVP, this could be a legitimate business. If not, you learned a lot about productizing AI agents without burning 6 months.

---

## Appendix: Sources

**n8n Workflow Automation Research:**
- [n8n Features Overview](https://n8n.io/features/)
- [n8n Guide 2026: Features & Workflow Automation](https://hatchworks.com/blog/ai-agents/n8n-guide/)
- [N8n Workflow Automation: 2026 Guide to AI-Powered Workflows](https://medium.com/@aksh8t/n8n-workflow-automation-the-2026-guide-to-building-ai-powered-workflows-that-actually-work-cd62f22afcc8)

**Open Source LLM Deployment:**
- [Local LLM Hosting: Complete 2025 Guide](https://medium.com/@rosgluk/local-llm-hosting-complete-2025-guide-ollama-vllm-localai-jan-lm-studio-more-f98136ce7e4a)
- [vLLM Quickstart: High-Performance LLM Serving](https://www.glukhov.org/post/2026/01/vllm-quickstart/)
- [Ollama vs vLLM: Choosing the Right LLM Serving Tool](https://developers.redhat.com/articles/2025/07/08/ollama-or-vllm-how-choose-right-llm-serving-tool-your-use-case)
- [vLLM vs Ollama: Performance Comparison](https://northflank.com/blog/vllm-vs-ollama-and-how-to-run-them)

**Multi-Tenant Architecture & PostgreSQL:**
- [Building Multi-Tenant RAG Applications With PostgreSQL](https://www.tigerdata.com/blog/building-multi-tenant-rag-applications-with-postgresql-choosing-the-right-approach)
- [Multi-tenant Data Isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Designing Your Postgres Database for Multi-tenancy](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- [Achieving Robust Multi-Tenant Data Isolation with PostgreSQL RLS](https://leapcell.io/blog/achieving-robust-multi-tenant-data-isolation-with-postgresql-row-level-security)

---

**Next Steps:**
1. Share this doc with potential beta customers to gauge interest
2. Scope out the 5 n8n workflows needed for MVP (Gmail, Slack, Sheets, HTTP, webhook)
3. Create Docker Compose file with all services configured
4. Build minimal agent-to-n8n communication layer
5. Test with 1 real-world workflow end-to-end
