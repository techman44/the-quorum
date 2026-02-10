# The Quorum - Integrations Guide

## Overview

Integrations connect your Quorum agents to external data sources and services. When an integration is enabled, agents that support it can read from and act on that data source during their analysis and planning cycles.

**How it works:**

1. You enable an integration in `integrations/integrations.yaml`
2. You set the required environment variables in your `.env` file
3. Agents check `integration_available("name")` before attempting to use a data source
4. If available, the agent can query and act on that data source

Agents never crash or fail if an integration is unavailable -- they simply skip that data source. This means you can start with zero integrations and add them over time as needed.

## Quick Start

```bash
# See all available integrations
./scripts/manage_integrations.sh list

# Enable an integration
./scripts/manage_integrations.sh enable gmail

# Check that enabled integrations are properly configured
./scripts/manage_integrations.sh check

# Get detailed setup instructions for an integration
./scripts/manage_integrations.sh info slack
```

Or use the Python API directly:

```python
from integrations.loader import integration_available, get_enabled_integrations

# Check if a specific integration is ready to use
if integration_available("gmail"):
    # proceed with Gmail access
    pass

# Get all enabled integrations
enabled = get_enabled_integrations()

# Get integrations available to a specific agent
from integrations.loader import get_integrations_for_agent
my_integrations = get_integrations_for_agent("connector")
```

## Available Integrations

### Gmail

**What it does:** Ingests your email so agents can search and reference your email history.

**Benefit:** The Connector can find relevant past conversations. The Executor can create tasks from emails. The Opportunist can spot forgotten follow-ups.

**Agents:** connector, executor, opportunist, data_collector

**Setup:**
1. Create a Google Cloud project at https://console.cloud.google.com/
2. Enable the Gmail API
3. Create OAuth 2.0 credentials (Desktop application type)
4. Download the credentials JSON file
5. Place it at `credentials/gmail_oauth.json`
6. On first run, you will be prompted to authorize access in your browser
7. The resulting token will be saved for future use

**Configuration options:**
- `max_emails_per_sync`: Number of emails to fetch per sync cycle (default: 100)
- `sync_interval_minutes`: How often to check for new emails (default: 30)
- `labels_to_sync`: Which Gmail labels to sync (default: INBOX, SENT)

---

### Calendar

**What it does:** Gives agents awareness of your schedule -- meetings, events, and availability.

**Benefit:** The Strategist can plan around your commitments. The Executor can set task deadlines relative to meetings. The Connector can link conversations to upcoming events.

**Agents:** strategist, executor, connector

**Setup (Google Calendar):**
1. Use the same Google Cloud project as Gmail (or create a new one)
2. Enable the Google Calendar API
3. The same OAuth credentials work for both Gmail and Calendar
4. Set `provider: "google"` in the config

**Setup (Outlook):**
1. Register an app in Azure AD
2. Add Calendar.Read permission
3. Set `provider: "outlook"` in the config
4. Set `OUTLOOK_CLIENT_ID` and `OUTLOOK_CLIENT_SECRET` in `.env`

**Setup (CalDAV):**
1. Set `provider: "caldav"` in the config
2. Set `CALDAV_URL`, `CALDAV_USERNAME`, and `CALDAV_PASSWORD` in `.env`

**Configuration options:**
- `provider`: Calendar provider -- `google`, `outlook`, or `caldav`
- `lookahead_days`: How many days ahead to look for events (default: 14)

---

### Slack

**What it does:** Ingests Slack messages so agents can reference team conversations.

**Benefit:** The Connector links Slack threads to your documents and decisions. The Executor extracts action items from channels.

**Agents:** connector, executor, data_collector

**Setup:**
1. Go to https://api.slack.com/apps and create a new app
2. Under "OAuth & Permissions", add these bot token scopes:
   - `channels:history` -- read public channel messages
   - `channels:read` -- list channels
   - `groups:history` -- read private channel messages (optional)
   - `search:read` -- search messages
3. Install the app to your workspace
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)
5. Add to your `.env` file:
   ```
   SLACK_BOT_TOKEN=xoxb-your-token-here
   ```

**Configuration options:**
- `channels_to_watch`: List of channel names to monitor (empty = all accessible channels)
- `sync_interval_minutes`: How often to check for new messages (default: 15)

---

### Telegram

**What it does:** Enables agents to send you notifications via Telegram.

**Benefit:** Get proactive alerts when agents find something important. The Executor can ping you about overdue tasks. The Connector can surface relevant history in real-time.

**Agents:** connector, executor, strategist, devils_advocate, opportunist

**Setup:**
1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the bot token BotFather gives you
4. Start a conversation with your new bot
5. Get your chat ID by visiting `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` after sending a message to your bot
6. Add to your `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token-here
   TELEGRAM_CHAT_ID=your-chat-id-here
   ```

**Configuration options:**
- `notify_on`: Which event types trigger notifications -- `accountability`, `connection`, `opportunity`, `critique`
- `respect_quiet_hours`: Whether to suppress notifications during quiet hours (default: true)

---

### Paperless-NGX

**What it does:** Syncs documents from your Paperless-NGX instance so agents can reference scanned/OCR'd documents.

**Benefit:** The Data Collector automatically ingests OCR'd documents. The Connector can link conversations to physical documents. The Strategist can reference receipts, contracts, and records.

**Agents:** data_collector, connector, strategist

**Setup:**
1. Ensure your Paperless-NGX instance is running and accessible
2. Generate an API token in Paperless-NGX (Settings > API tokens)
3. Add to your `.env` file:
   ```
   PAPERLESS_URL=https://your-paperless-instance.example.com
   PAPERLESS_API_TOKEN=your-api-token-here
   ```

**Configuration options:**
- `sync_interval_minutes`: How often to check for new documents (default: 60)
- `document_types`: List of document types to sync (empty = all types)

---

### Obsidian

**What it does:** Indexes your Obsidian vault so agents can search your personal notes.

**Benefit:** The Connector links conversations to your personal knowledge base. The Strategist can reference notes during reflections.

**Agents:** data_collector, connector, strategist

**Setup:**
1. Locate your Obsidian vault directory on disk
2. Add to your `.env` file:
   ```
   OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
   ```
3. Set `vault_path` in the integration config to match

Note: This integration reads files directly from disk. It does not require the Obsidian app to be running.

**Configuration options:**
- `vault_path`: Absolute path to your Obsidian vault directory
- `index_interval_hours`: How often to re-index the vault (default: 6)
- `file_types`: Which file extensions to index (default: `.md`)

---

### Location

**What it does:** Provides location awareness via Dawarich or OwnTracks.

**Benefit:** Agents know where you are. The Strategist can factor location into daily planning. The Opportunist can suggest nearby opportunities.

**Agents:** strategist, opportunist

**Setup (Dawarich):**
1. Set up a Dawarich instance (https://github.com/Freika/dawarich)
2. Generate an API token in Dawarich settings
3. Add to your `.env` file:
   ```
   LOCATION_PROVIDER=dawarich
   LOCATION_URL=https://your-dawarich-instance.example.com
   LOCATION_API_TOKEN=your-api-token-here
   ```

**Setup (OwnTracks):**
1. Set up an OwnTracks recorder (https://owntracks.org/)
2. Configure your OwnTracks mobile app to report to the recorder
3. Add to your `.env` file:
   ```
   LOCATION_PROVIDER=owntracks
   LOCATION_URL=https://your-owntracks-instance.example.com
   LOCATION_API_TOKEN=your-api-token-here
   ```

**Configuration options:**
- `provider`: Location service -- `dawarich` or `owntracks`
- `check_interval_minutes`: How often to check location (default: 60)

---

### Weather

**What it does:** Provides weather data so agents can factor conditions into planning.

**Benefit:** The Strategist considers weather in daily briefings. Good for outdoor activity planning and commute awareness.

**Agents:** strategist

**Setup:**
1. Add to your `.env` file:
   ```
   WEATHER_LOCATION=YourCity
   ```
   You can use a city name (e.g., `London`), airport code (e.g., `LAX`), or coordinates (e.g., `40.7128,-74.0060`).

No API key is required. This integration uses [wttr.in](https://wttr.in), which is free.

**Configuration options:**
- `provider`: Weather service (default: `wttr.in`)
- `location`: Your location identifier

---

### CRM

**What it does:** Connects to your CRM system so agents can reference customer and contact data.

**Benefit:** The Connector links conversations to contacts. The Executor creates follow-up tasks for contacts. The Opportunist spots neglected relationships.

**Agents:** connector, executor, opportunist, data_collector

**Setup (HubSpot):**
1. Go to HubSpot Settings > Integrations > API key
2. Generate an API key or create a private app
3. Add to your `.env` file:
   ```
   CRM_PROVIDER=hubspot
   CRM_URL=https://api.hubapi.com
   CRM_API_TOKEN=your-hubspot-api-token-here
   ```

**Setup (Pipedrive):**
1. Go to Pipedrive Settings > Personal preferences > API
2. Copy your API token
3. Add to your `.env` file:
   ```
   CRM_PROVIDER=pipedrive
   CRM_URL=https://your-company.pipedrive.com
   CRM_API_TOKEN=your-pipedrive-api-token-here
   ```

**Configuration options:**
- `provider`: CRM system -- `hubspot`, `pipedrive`, or `custom`
- `sync_interval_minutes`: How often to sync contact data (default: 60)

---

### GitHub

**What it does:** Connects to GitHub so agents can reference issues, pull requests, and repository activity.

**Benefit:** The Executor can create GitHub issues from tasks. The Connector links discussions to PRs. The Strategist tracks project velocity.

**Agents:** executor, connector, strategist, data_collector

**Setup:**
1. Go to https://github.com/settings/tokens
2. Generate a new token (classic) with these scopes:
   - `repo` -- full repository access
   - `read:org` -- read org membership (optional, for org repos)
3. Add to your `.env` file:
   ```
   GITHUB_TOKEN=ghp_your-token-here
   ```

**Configuration options:**
- `repos_to_watch`: List of repositories to monitor in `owner/repo` format (empty = all accessible)
- `sync_interval_minutes`: How often to check for updates (default: 30)

---

### n8n

**What it does:** Connects to your n8n instance so agents can trigger workflow automations.

**Benefit:** The Executor can trigger automated workflows when tasks are created. Enables complex multi-step automations without code.

**Agents:** executor, data_collector

**Setup:**
1. Ensure your n8n instance is running and accessible
2. Go to n8n Settings > API > Create API key
3. Add to your `.env` file:
   ```
   N8N_URL=https://your-n8n-instance.example.com
   N8N_API_TOKEN=your-n8n-api-key-here
   ```

**Configuration options:**
- `webhook_base_url`: Base URL for n8n webhooks (if different from N8N_URL)

---

## Adding Custom Integrations

You can add your own integrations by extending `integrations.yaml`. Each integration needs:

```yaml
  my_custom_integration:
    enabled: false
    description: "Short description of what this integration does"
    benefit: "How this helps your agents -- mention specific agent names"
    agents: [connector, executor]  # which agents can use this
    setup:
      credentials_type: "api_token"  # oauth2, bot_token, api_token, personal_access_token, filesystem, none
      env_var: "MY_INTEGRATION_TOKEN"  # env var to check (optional)
      instructions: "How to set up credentials"
    config:
      # Integration-specific settings go here
      my_setting: "default_value"
```

After adding the YAML entry, you need to:

1. Create an integration module (optional but recommended):
   - Add a file in `integrations/` for the integration logic
   - Implement data fetching and any sync logic

2. Update the relevant agent(s) to use the new integration:
   ```python
   from integrations.loader import integration_available, get_integration_config

   if integration_available("my_custom_integration"):
       config = get_integration_config("my_custom_integration")
       # Use the integration
   ```

3. Test with:
   ```bash
   ./scripts/manage_integrations.sh check
   ```

## Security Considerations

### Credential Storage

- **Never commit credentials to git.** All secrets should be in your `.env` file, which is gitignored.
- OAuth tokens and API keys are read from environment variables at runtime.
- The `integrations.yaml` file itself contains no secrets -- only configuration and the names of environment variables.

### Data Flow

- **Read-only by default.** Most integrations only read data (email, calendar, documents). Write access (creating issues, sending notifications) is limited to specific agent actions.
- **Data stays local.** Ingested data is stored in your local Quorum database. It is not sent to external services unless an agent explicitly performs an outbound action (e.g., sending a Telegram notification).
- **Agent boundaries.** Each integration specifies which agents can access it. The Connector cannot trigger n8n workflows; the Executor cannot read Obsidian notes (unless you add those agents to the integration's `agents` list).

### Network Access

- Integrations that connect to external APIs (Gmail, Slack, GitHub, etc.) require network access to those services.
- Self-hosted integrations (Paperless-NGX, n8n, Dawarich) connect to your own infrastructure.
- The Weather integration uses a free public API (wttr.in) with no authentication.
- The Obsidian integration reads from the local filesystem only.

### Recommendations

1. Use the principle of least privilege -- only enable integrations you actually need.
2. For API tokens, create tokens with the minimum required scopes.
3. Rotate tokens periodically, especially if you suspect they may have been exposed.
4. Review the `agents` list for each integration -- remove agents that do not need access.
5. If running The Quorum on a shared server, ensure your `.env` file has restrictive permissions (`chmod 600 .env`).
