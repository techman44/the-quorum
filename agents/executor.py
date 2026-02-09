"""The Executor -- extracts actions and enforces accountability.

Scans recent conversations and events for commitments and actionable items,
creates or updates tasks, and surfaces accountability events when deadlines
are missed or work goes stale.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.executor")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "executor.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# How far back to look for recent activity (hours).
_DEFAULT_LOOKBACK_HOURS = 24

# Tasks older than this without update are considered stale (days).
_STALE_TASK_DAYS = 7


class ExecutorAgent(QuorumAgent):
    """Extracts tasks from conversations, enforces deadlines, creates accountability events."""

    def __init__(self, lookback_hours: int = _DEFAULT_LOOKBACK_HOURS):
        super().__init__("executor")
        self.lookback_hours = lookback_hours

    # ------------------------------------------------------------------
    # Data retrieval
    # ------------------------------------------------------------------

    def _recent_turns(self) -> list[dict]:
        """Fetch conversation turns from the lookback window."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM conversation_turns
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 200
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_events(self) -> list[dict]:
        """Fetch events from the lookback window."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM events
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 200
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _open_tasks(self) -> list[dict]:
        """Fetch all non-completed, non-cancelled tasks."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT * FROM tasks
            WHERE status NOT IN ('done', 'cancelled')
            ORDER BY priority, created_at
            LIMIT 500
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _overdue_tasks(self) -> list[dict]:
        """Fetch tasks that are past their due date and still open."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT * FROM tasks
            WHERE status NOT IN ('done', 'cancelled')
              AND due_at IS NOT NULL
              AND due_at < NOW()
            ORDER BY due_at
            LIMIT 100
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _stale_tasks(self) -> list[dict]:
        """Fetch tasks that haven't been updated in a long time."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cutoff = datetime.now(timezone.utc) - timedelta(days=_STALE_TASK_DAYS)

        cur.execute(
            """
            SELECT * FROM tasks
            WHERE status NOT IN ('done', 'cancelled')
              AND updated_at < %s
            ORDER BY updated_at
            LIMIT 100
            """,
            [cutoff],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Cross-agent context
    # ------------------------------------------------------------------

    def _get_connector_insights(self) -> list[dict]:
        """Fetch recent connection events from the Connector agent."""
        return self.get_other_agent_events(
            agent_names=["connector"],
            hours=24,
            limit=15,
        )

    def _get_opportunist_findings(self) -> list[dict]:
        """Fetch recent opportunity events from the Opportunist agent."""
        return self.get_other_agent_events(
            agent_names=["opportunist"],
            hours=24,
            limit=10,
        )

    # ------------------------------------------------------------------
    # LLM interaction
    # ------------------------------------------------------------------

    def _build_payload(
        self,
        turns: list[dict],
        events: list[dict],
        tasks: list[dict],
        connector_insights: list[dict] = None,
        opportunist_findings: list[dict] = None,
    ) -> str:
        """Build a JSON payload for the LLM."""

        def _serialize(items: list[dict], max_items: int = 50) -> list[dict]:
            out = []
            for item in items[:max_items]:
                serialized = {}
                for k, v in item.items():
                    if isinstance(v, datetime):
                        serialized[k] = v.isoformat()
                    elif hasattr(v, "__str__"):
                        serialized[k] = str(v)
                    else:
                        serialized[k] = v
                out.append(serialized)
            return out

        return json.dumps(
            {
                "recent_turns": _serialize(turns),
                "recent_events": _serialize(events),
                "open_tasks": _serialize(tasks),
                "connector_insights": _serialize(connector_insights or []),
                "opportunist_findings": _serialize(opportunist_findings or []),
            },
            default=str,
        )

    def _parse_response(self, raw: str) -> dict:
        """Parse the LLM's structured response."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response: %s", raw[:200])
            return {"new_tasks": [], "updated_tasks": [], "accountability_events": []}

    # ------------------------------------------------------------------
    # Task and event actions
    # ------------------------------------------------------------------

    def _create_tasks_from_llm(self, new_tasks: list[dict]) -> int:
        """Create tasks suggested by the LLM."""
        created = 0
        for t in new_tasks:
            try:
                self.upsert_task(
                    title=t["title"],
                    description=t.get("description", ""),
                    priority=int(t.get("priority", 3)),
                    owner=t.get("owner"),
                    due_at=t.get("due_at"),
                )
                created += 1
            except Exception as exc:
                logger.warning("Failed to create task '%s': %s", t.get("title"), exc)
        return created

    def _update_tasks_from_llm(self, updates: list[dict]) -> int:
        """Apply task status updates from the LLM."""
        conn = self.connect_db()
        cur = conn.cursor()
        updated = 0
        for u in updates:
            task_id = u.get("task_id")
            new_status = u.get("status")
            if not task_id or not new_status:
                continue
            try:
                cur.execute(
                    """
                    UPDATE tasks SET status = %s,
                        completed_at = CASE WHEN %s = 'done' THEN NOW() ELSE completed_at END
                    WHERE id = %s::uuid
                    """,
                    [new_status, new_status, task_id],
                )
                updated += 1
            except Exception as exc:
                logger.warning("Failed to update task %s: %s", task_id, exc)
                conn.rollback()
        conn.commit()
        cur.close()
        return updated

    def _create_accountability_events(self) -> int:
        """Create accountability events for overdue and stale tasks."""
        count = 0

        for task in self._overdue_tasks():
            days_overdue = (datetime.now(timezone.utc) - task["due_at"]).days
            self.store_event(
                event_type="accountability",
                title=f"Overdue: {task['title']}",
                description=(
                    f"Task '{task['title']}' was due {task['due_at'].strftime('%Y-%m-%d')} "
                    f"({days_overdue} day(s) ago) and is still in '{task['status']}' status. "
                    f"Owner: {task.get('owner', 'unassigned')}."
                ),
                ref_ids=[str(task["id"])],
            )
            count += 1

        for task in self._stale_tasks():
            days_stale = (datetime.now(timezone.utc) - task["updated_at"]).days
            self.store_event(
                event_type="accountability",
                title=f"Stale: {task['title']}",
                description=(
                    f"Task '{task['title']}' has not been updated in {days_stale} days. "
                    f"Status: '{task['status']}'. Owner: {task.get('owner', 'unassigned')}. "
                    f"Is this still relevant? If so, what's blocking it?"
                ),
                ref_ids=[str(task["id"])],
            )
            count += 1

        return count

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        turns = self._recent_turns()
        events = self._recent_events()
        tasks = self._open_tasks()

        # Gather cross-agent context: Connector insights and Opportunist quick wins.
        connector_insights = self._get_connector_insights()
        opportunist_findings = self._get_opportunist_findings()
        if connector_insights:
            logger.info("Loaded %d Connector insights for context.", len(connector_insights))
        if opportunist_findings:
            logger.info("Loaded %d Opportunist findings for context.", len(opportunist_findings))

        # Phase 1: accountability for overdue / stale tasks (rule-based, no LLM needed).
        accountability_count = self._create_accountability_events()

        # Phase 2: ask the LLM to extract new tasks and updates from recent activity.
        created = 0
        updated = 0
        if turns or events:
            payload = self._build_payload(turns, events, tasks, connector_insights, opportunist_findings)
            raw = self.call_llm(SYSTEM_PROMPT, payload)
            parsed = self._parse_response(raw)

            created = self._create_tasks_from_llm(parsed.get("new_tasks", []))
            updated = self._update_tasks_from_llm(parsed.get("updated_tasks", []))

            # Phase 3: any additional accountability the LLM flagged.
            for ae in parsed.get("accountability_events", []):
                self.store_event(
                    event_type="accountability",
                    title=ae.get("title", "Accountability notice"),
                    description=ae.get("description", ""),
                )
                accountability_count += 1

        summary = (
            f"Created {created} tasks, updated {updated}, "
            f"logged {accountability_count} accountability events."
        )
        logger.info(summary)
        return summary


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Run the Executor agent")
    parser.add_argument("--since", type=str, default="24h", help="Lookback window, e.g. '24h', '48h'")
    args = parser.parse_args()

    # Parse the --since flag into hours.
    since_str = args.since.strip().lower()
    if since_str.endswith("h"):
        hours = int(since_str[:-1])
    elif since_str.endswith("d"):
        hours = int(since_str[:-1]) * 24
    else:
        hours = int(since_str)

    agent = ExecutorAgent(lookback_hours=hours)
    agent.execute()
